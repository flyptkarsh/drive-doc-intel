import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { AskResult, ChatTurn } from "@/lib/types";
import { anthropic, REFUSAL_FALLBACK } from "../claude";
import { db, type Sql } from "../db";
import { env } from "../env";
import { runScopedQuery, SCHEMA_DESCRIPTION, searchDocuments } from "./sql";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type Tool = Anthropic.Beta.Messages.BetaTool;
type ToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type ToolResultBlock = Anthropic.Beta.Messages.BetaToolResultBlockParam;

const MAX_TURNS = 10;
const MAX_HISTORY = 8;
const MAX_TOOL_RESULT_CHARS = 60_000;
const MAX_SOURCES = 12;

const SYSTEM_PROMPT = `You answer questions about a user's financial documents (fund factsheets, statements, performance reports) that were ingested from their Google Drive and extracted into tables.

Use run_sql to look at the data before answering; never guess numbers. Fund names can vary slightly between documents, so use ILIKE or check distinct fund names when a match looks thin. When the user names a month without a year, use the most recent year in the data and say which year you used. Use search_documents for prose content.

Answer in concise Markdown. Lead with the direct answer, show supporting figures in a small table when there are several, and name the source documents. If the data can't answer the question, say what's missing.`;

const queryInput = (description: string) => ({
  type: "object" as const,
  properties: { query: { type: "string", description } },
  required: ["query"],
  additionalProperties: false,
});

const TOOLS: Tool[] = [
  {
    name: "run_sql",
    description: `Run a read-only PostgreSQL SELECT over the user's extracted data and get up to 200 rows back.\n\n${SCHEMA_DESCRIPTION}`,
    strict: true,
    input_schema: queryInput("A single SELECT (or WITH ... SELECT) statement"),
  },
  {
    name: "search_documents",
    description:
      "Full-text search across the documents' original text, titles and summaries. Use it for " +
      "questions about content that isn't in the structured tables (commentary, strategy, fee " +
      "wording, holdings mentioned in prose).",
    strict: true,
    input_schema: queryInput("Search terms"),
  },
];

/** Answers a question by letting Claude query the user's data with tools. */
export async function ask(
  userId: string,
  question: string,
  history: ChatTurn[] = [],
): Promise<AskResult> {
  const sql = await db();
  const messages: MessageParam[] = [
    ...history.slice(-MAX_HISTORY),
    { role: "user", content: question },
  ];
  const queries: AskResult["queries"] = [];
  const documentIds = new Set<string>();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await anthropic().beta.messages.create({
      model: env.model,
      max_tokens: 16000,
      ...REFUSAL_FALLBACK,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { answer: "Sorry, I can't help with that question.", queries, sources: [] };
    }

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const answer = response.content
        .flatMap((b) => (b.type === "text" ? [b.text] : []))
        .join("\n")
        .trim();
      return {
        answer: answer || "I couldn't produce an answer.",
        queries,
        sources: await loadSources(sql, userId, documentIds),
      };
    }

    // Echo the full assistant turn (including thinking blocks), then all results in one message.
    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolUses.map((toolUse) => runTool(sql, userId, toolUse, queries, documentIds)),
    );
    messages.push({ role: "user", content: results });
  }

  return {
    answer: "I ran out of steps before finishing. Try a narrower question.",
    queries,
    sources: await loadSources(sql, userId, documentIds),
  };
}

async function runTool(
  sql: Sql,
  userId: string,
  toolUse: ToolUseBlock,
  queries: AskResult["queries"],
  documentIds: Set<string>,
): Promise<ToolResultBlock> {
  const { query } = toolUse.input as { query?: unknown };
  const text = typeof query === "string" ? query : "";
  const isSql = toolUse.name === "run_sql";
  try {
    const rows = (
      isSql ? await runScopedQuery(sql, userId, text) : await searchDocuments(sql, userId, text)
    ) as Record<string, unknown>[];
    if (isSql) queries.push({ sql: text, rowCount: rows.length });
    for (const row of rows) {
      const id = isSql ? row.document_id : row.id;
      if (typeof id === "string") documentIds.add(id);
    }
    return {
      type: "tool_result",
      tool_use_id: toolUse.id,
      content: JSON.stringify(rows).slice(0, MAX_TOOL_RESULT_CHARS),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isSql) queries.push({ sql: text, error: message });
    return { type: "tool_result", tool_use_id: toolUse.id, content: message, is_error: true };
  }
}

async function loadSources(sql: Sql, userId: string, ids: Set<string>) {
  if (ids.size === 0) return [];
  const rows = await sql<{ id: string; name: string; web_view_link: string | null }[]>`
    select id, name, web_view_link from documents
    where user_id = ${userId} and id = any(${[...ids]}::uuid[])
    limit ${MAX_SOURCES}`;
  return rows.map((r) => ({ id: r.id, name: r.name, link: r.web_view_link }));
}
