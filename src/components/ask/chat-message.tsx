import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Database, FileText } from "lucide-react";
import type { AskResult } from "@/lib/types";

export type Message =
  | { role: "user"; content: string }
  | ({ role: "assistant"; content: string } & Partial<Omit<AskResult, "answer">>);

export function ChatMessage({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const { content, sources = [], queries = [] } = message;
  return (
    <div className="max-w-[90%] space-y-3">
      <div className="markdown text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>

      {sources.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
          {sources.map((source) => (
            <li key={source.id}>
              <a
                href={source.link ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-60 items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{source.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {queries.length > 0 && (
        <details className="text-xs">
          <summary className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground">
            <Database className="size-3" /> {queries.length}{" "}
            {queries.length === 1 ? "query" : "queries"} run
          </summary>
          <div className="mt-2 space-y-2">
            {queries.map((query, i) => (
              <pre
                key={i}
                className="overflow-x-auto rounded-md bg-muted p-2 font-mono whitespace-pre-wrap"
              >
                {query.sql}
                {"\n"}
                <span className="text-muted-foreground">
                  -- {query.error ? `error: ${query.error}` : `${query.rowCount} rows`}
                </span>
              </pre>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
