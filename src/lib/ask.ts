import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, FALLBACK } from "./claude";
import { db } from "./db";
import { env } from "./env";

type Msg = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export type QueryTrace = { sql: string; rowCount?: number; error?: string };
export type AskResult = { answer: string; queries: QueryTrace[]; sources: { id: string; name: string; link: string | null }[] };

// The model's SQL only ever sees these CTEs, each pre-filtered to the user.
const SCOPED_VIEWS = `
documents as (select id, name, document_type, title, manager, as_of_date, currency, summary, web_view_link, drive_modified_at, processed_at from public.documents where user_id = $1 and status = 'done'),
funds as (select document_id, fund_name, share_class, isin, ticker, strategy, asset_class from public.funds where user_id = $1),
performance as (select document_id, fund_name, share_class, period_type, period_label, period_start, period_end, return_pct, benchmark_name, benchmark_return_pct, is_annualized, net_or_gross, currency from public.performance where user_id = $1),
metrics as (select document_id, fund_name, name, value_number, value_text, unit, as_of_date from public.metrics where user_id = $1)`;

const SCHEMA_DOC = `Tables (PostgreSQL):
documents(id uuid, name text, document_type text, title text, manager text, as_of_date date, currency text, summary text, web_view_link text, drive_modified_at timestamptz, processed_at timestamptz)
funds(document_id uuid, fund_name text, share_class text, isin text, ticker text, strategy text, asset_class text)
performance(document_id uuid, fund_name text, share_class text, period_type text, period_label text, period_start date, period_end date, return_pct numeric, benchmark_name text, benchmark_return_pct numeric, is_annualized boolean, net_or_gross text, currency text)
metrics(document_id uuid, fund_name text, name text, value_number numeric, value_text text, unit text, as_of_date date)

performance.period_type is one of: month, quarter, ytd, 1y, 3y, 5y, 10y, since_inception, calendar_year, other.
return_pct and benchmark_return_pct are percentages (1.25 means +1.25%).
document_type is one of: fund_factsheet, account_statement, performance_report, investor_letter, transaction_confirmation, market_commentary, other.
metrics.name is snake_case, e.g. aum, nav, account_value, sharpe_ratio, volatility, max_drawdown, management_fee.`;

const FORBIDDEN = /;|\b(public|pg_catalog|information_schema)\s*\.|\bpg_\w+|\b(users|drive_connections)\b|\b(set_config|current_setting|dblink|lo_\w+|copy)\b/i;

export async function runSql(userId: string, query: string) {
  const q = query.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(q)) throw new Error("Only SELECT queries are allowed.");
  if (FORBIDDEN.test(q)) throw new Error("Query references something outside the allowed tables.");
  const sql = await db();
  const wrapped = `with ${SCOPED_VIEWS} select * from (${q}) as result limit 200`;
  return sql.begin("read only", async (tx) => {
    await tx`set local statement_timeout = 5000`;
    return tx.unsafe(wrapped, [userId]);
  });
}

async function searchDocuments(userId: string, query: string) {
  const sql = await db();
  return sql`
    select id, name, title, manager, as_of_date, document_type, summary,
      ts_headline('english', coalesce(text_content, ''), websearch_to_tsquery('english', ${query}),
        'MaxFragments=3, MaxWords=30, MinWords=10') as excerpt
    from documents
    where user_id = ${userId} and status = 'done'
      and search @@ websearch_to_tsquery('english', ${query})
    order by ts_rank(search, websearch_to_tsquery('english', ${query})) desc
    limit 8`;
}

const TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: "run_sql",
    description: `Run a read-only PostgreSQL SELECT over the user's extracted data and get up to 200 rows back.\n\n${SCHEMA_DOC}`,
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "A single SELECT (or WITH ... SELECT) statement" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "search_documents",
    description:
      "Full-text search across the documents' original text, titles and summaries. Use it for questions about content that isn't in the structured tables (commentary, strategy, fees wording, holdings mentioned in prose).",
    strict: true,
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search terms" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

const SYSTEM = `You answer questions about a user's financial documents (fund factsheets, statements, performance reports) that were ingested from their Google Drive and extracted into tables.

Use run_sql to look at the data before answering; never guess numbers. Fund names can vary slightly between documents, so use ILIKE or check distinct fund names when a match looks thin. When the user names a month without a year, use the most recent year in the data and say which year you used. Use search_documents for prose content.

Answer in concise Markdown. Lead with the direct answer, show supporting figures in a small table when there are several, and name the source documents. If the data can't answer the question, say what's missing.`;

export async function ask(userId: string, question: string, history: { role: "user" | "assistant"; content: string }[] = []): Promise<AskResult> {
  const messages: Msg[] = [
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: question },
  ];
  const queries: QueryTrace[] = [];
  const docIds = new Set<string>();

  for (let turn = 0; turn < 10; turn++) {
    const response = await anthropic().beta.messages.create({
      model: env.model,
      max_tokens: 16000,
      ...FALLBACK,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { answer: "Sorry, I can't help with that question.", queries, sources: [] };
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const answer = response.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { answer: answer || "I couldn't produce an answer.", queries, sources: await sourcesFor(userId, docIds) };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: ToolResult[] = await Promise.all(
      toolUses.map(async (tu): Promise<ToolResult> => {
        const input = tu.input as { query?: unknown };
        const query = typeof input.query === "string" ? input.query : "";
        try {
          const rows = tu.name === "run_sql" ? await runSql(userId, query) : await searchDocuments(userId, query);
          if (tu.name === "run_sql") queries.push({ sql: query, rowCount: rows.length });
          for (const r of rows as Record<string, unknown>[]) {
            const id = (r.document_id ?? (tu.name === "search_documents" ? r.id : undefined)) as string | undefined;
            if (typeof id === "string") docIds.add(id);
          }
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(rows).slice(0, 60000) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (tu.name === "run_sql") queries.push({ sql: query, error: message });
          return { type: "tool_result", tool_use_id: tu.id, content: message, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { answer: "I ran out of steps before finishing. Try a narrower question.", queries, sources: await sourcesFor(userId, docIds) };
}

async function sourcesFor(userId: string, ids: Set<string>) {
  if (ids.size === 0) return [];
  const sql = await db();
  const rows = await sql<{ id: string; name: string; web_view_link: string | null }[]>`
    select id, name, web_view_link from documents where user_id = ${userId} and id = any(${[...ids]}::uuid[]) limit 12`;
  return rows.map((r) => ({ id: r.id, name: r.name, link: r.web_view_link }));
}
