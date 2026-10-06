export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL || process.env.DISABLE_POLLER === "1") return;
  const { startPoller } = await import("./lib/poller");
  startPoller();
}
