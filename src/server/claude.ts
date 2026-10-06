import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicBeta, BetaFallbacksParam } from "@anthropic-ai/sdk/resources/beta";

const cache = globalThis as unknown as { __anthropic?: Anthropic };

/** Shared client; reads ANTHROPIC_API_KEY from the environment. */
export function anthropic(): Anthropic {
  cache.__anthropic ??= new Anthropic();
  return cache.__anthropic;
}

/**
 * Server-side refusal fallback: if a request is declined, the API re-runs it on
 * a fallback model inside the same call.
 */
export const REFUSAL_FALLBACK: { betas: AnthropicBeta[]; fallbacks: BetaFallbacksParam } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};
