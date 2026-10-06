import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { ask } from "@/lib/ask";
import { requireUser } from "@/lib/session";

export const maxDuration = 300;

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { question, history } = (await req.json()) as {
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!question?.trim()) return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  return NextResponse.json(await ask(user.id, question.trim(), history ?? []));
});
