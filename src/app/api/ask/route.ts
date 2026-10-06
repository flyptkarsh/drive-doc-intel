import { z } from "zod";
import { ask } from "@/server/ask/agent";
import { authedRoute, ok, readJson } from "@/server/http";

const Body = z.object({
  question: z.string().trim().min(1, "Ask a question").max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(50)
    .default([]),
});

export const maxDuration = 300;

export const POST = authedRoute(async (req, user) => {
  const { question, history } = await readJson(req, Body);
  return ok(await ask(user.id, question, history));
});
