import Anthropic from "@anthropic-ai/sdk";

declare global {
  var __anthropic: Anthropic | undefined;
}

export function anthropic(): Anthropic {
  globalThis.__anthropic ??= new Anthropic();
  return globalThis.__anthropic;
}

// Server-side refusal fallback: if a request is declined, the API re-runs it
// on a fallback model inside the same call.
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};
