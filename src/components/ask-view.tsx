"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Database, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/format";

type Answer = {
  answer: string;
  queries: { sql: string; rowCount?: number; error?: string }[];
  sources: { id: string; name: string; link: string | null }[];
};
type Turn = { role: "user"; content: string } | ({ role: "assistant"; content: string } & Partial<Answer>);

const SUGGESTIONS = [
  "Which fund had the best January return?",
  "Compare YTD returns against benchmarks for every fund",
  "Which funds underperformed their benchmark last quarter?",
  "What is the total AUM across all funds, and as of when?",
];

export function AskView() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [turns, busy]);

  const send = async (question: string) => {
    if (!question.trim() || busy) return;
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await api<Answer>("/api/ask", { method: "POST", body: JSON.stringify({ question, history }) });
      setTurns((t) => [...t, { role: "assistant", content: res.answer, ...res }]);
    } catch (err) {
      setTurns((t) => [...t, { role: "assistant", content: `**Error:** ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex h-[calc(100vh-18rem)] min-h-[28rem] flex-col p-0">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {turns.length === 0 && (
          <div className="mx-auto flex max-w-xl flex-col items-center pt-10 text-center">
            <div className="bg-muted mb-3 grid size-11 place-items-center rounded-full"><Sparkles className="size-5" /></div>
            <h3 className="text-lg font-medium">Ask anything about your documents</h3>
            <p className="text-muted-foreground mt-1 text-sm">Answers are computed from the extracted data, with the queries and sources shown.</p>
            <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="hover:bg-muted rounded-lg border p-3 text-left text-sm transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2 text-sm">{t.content}</div>
            </div>
          ) : (
            <div key={i} className="max-w-[90%] space-y-3">
              <div className="prose-sm text-sm leading-relaxed [&_table]:my-2 [&_table]:w-full [&_table]:text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.content}</ReactMarkdown>
              </div>
              {!!t.sources?.length && (
                <div className="flex flex-wrap gap-1.5">
                  {t.sources.map((s) => (
                    <a key={s.id} href={s.link ?? "#"} target="_blank" rel="noreferrer" className="hover:bg-muted text-muted-foreground inline-flex max-w-60 items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
                      <FileText className="size-3 shrink-0" /><span className="truncate">{s.name}</span>
                    </a>
                  ))}
                </div>
              )}
              {!!t.queries?.length && (
                <details className="text-xs">
                  <summary className="text-muted-foreground inline-flex cursor-pointer items-center gap-1"><Database className="size-3" /> {t.queries.length} quer{t.queries.length === 1 ? "y" : "ies"} run</summary>
                  <div className="mt-2 space-y-2">
                    {t.queries.map((q, j) => (
                      <pre key={j} className="bg-muted overflow-x-auto rounded-md p-2 font-mono whitespace-pre-wrap">{q.sql}{"\n"}<span className="text-muted-foreground">-- {q.error ? `error: ${q.error}` : `${q.rowCount} rows`}</span></pre>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ),
        )}
        {busy && <div className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" /> Analyzing your documents…</div>}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Which fund had the best January return?"
          className="max-h-40 min-h-10 resize-none"
          rows={1}
        />
        <Button type="submit" size="icon-lg" disabled={busy || !input.trim()} aria-label="Ask"><ArrowUp /></Button>
      </form>
    </Card>
  );
}
