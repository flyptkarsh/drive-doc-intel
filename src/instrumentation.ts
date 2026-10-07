export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { missingRequiredEnv } = await import("./server/env");
  const missing = missingRequiredEnv();
  if (missing.length > 0) {
    console.warn(
      "\n⚠ Missing required environment variables (see README → API keys and secrets):\n" +
        missing.map((line) => `  - ${line}`).join("\n") +
        "\n",
    );
  }

  if (!process.env.DATABASE_URL || process.env.DISABLE_POLLER === "1") return;
  const { startPoller } = await import("./server/poller");
  startPoller();
}
