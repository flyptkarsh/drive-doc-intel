"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/fetcher";
import type { AskResult, ChatTurn } from "@/lib/types";
import { ChatMessage, type Message } from "./chat-message";

const SUGGESTIONS = [
  "Which fund had the best January return?",
  "Compare YTD returns against benchmarks for every fund",
  "Which funds underperformed their benchmark last quarter?",
  "What is the total AUM across all funds, and as of when?",
];

export function AskView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Braces matter: scrollIntoView() returns a Promise in current browsers, and an
  // effect must return nothing or a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || pending) return;
    const history: ChatTurn[] = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setPending(true);
    try {
      const { answer, ...rest } = await apiPost<AskResult>("/api/ask", { question: text, history });
      setMessages((m) => [...m, { role: "assistant", content: answer, ...rest }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `**Error:** ${(err as Error).message}` },
      ]);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="flex h-[calc(100vh-18rem)] min-h-[28rem] flex-col p-0">
      <div className="flex-1 space-y-6 overflow-y-auto p-6" aria-live="polite">
        {messages.length === 0 && <Suggestions onPick={send} />}
        {messages.map((message, i) => (
          <ChatMessage key={i} message={message} />
        ))}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Analyzing your documents…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Which fund had the best January return?"
          aria-label="Question"
          className="max-h-40 min-h-10 resize-none"
          rows={1}
        />
        <Button type="submit" size="icon-lg" disabled={pending || !input.trim()} aria-label="Ask">
          <ArrowUp />
        </Button>
      </form>
    </Card>
  );
}

function Suggestions({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-10 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-muted">
        <Sparkles className="size-5" />
      </div>
      <h3 className="text-lg font-medium">Ask anything about your documents</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Answers are computed from the extracted data, with the queries and sources shown.
      </p>
      <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onPick(suggestion)}
            className="rounded-lg border p-3 text-left text-sm transition-colors hover:bg-muted"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
