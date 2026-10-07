import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractionError } from "./extraction/errors";

/** Prefix of messages that mean the user must reconnect Google Drive. */
export const RECONNECT_HINT = "Reconnect Google Drive";

/**
 * Turns an error from Claude, Google or our own code into a short message that
 * is safe and useful to show in the UI. The raw error belongs in the logs.
 */
export function describeError(err: unknown): string {
  if (err instanceof ExtractionError) return err.message;

  if (err instanceof Anthropic.APIError) {
    if (err instanceof Anthropic.AuthenticationError) {
      return "The Anthropic API key is missing or invalid (ANTHROPIC_API_KEY).";
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return "The Anthropic API key doesn't have access to the configured model.";
    }
    if (err instanceof Anthropic.RateLimitError) {
      return "Claude is rate-limiting requests right now; this document will need a retry.";
    }
    if (err.status === 413) return "This document is too large to send to Claude.";
    if (/credit balance/i.test(err.message)) {
      return "The Anthropic account is out of credits. Add credits, then retry.";
    }
    if (err.status && err.status >= 500) {
      return "Claude had a temporary problem processing this document; please retry.";
    }
    return `Claude rejected the request: ${err.error?.error?.message ?? err.message}`;
  }

  const message = err instanceof Error ? err.message : String(err);
  if (/invalid_grant|Token has been expired or revoked|invalid_token/i.test(message)) {
    return `Google Drive access has expired or was revoked. ${RECONNECT_HINT}.`;
  }
  if (
    /insufficient.*(scope|permission)|accessNotConfigured|has not been used in project/i.test(
      message,
    )
  ) {
    return `Google Drive access isn't fully set up: ${message.slice(0, 200)}`;
  }
  return message.slice(0, 500);
}
