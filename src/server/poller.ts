import "server-only";
import { env } from "./env";
import { syncAllUsers } from "./sync";

const cache = globalThis as unknown as { __poller?: NodeJS.Timeout };
const FIRST_RUN_DELAY_MS = 5_000;

/** Polls every watched Drive folder so new files are picked up without user action. */
export function startPoller(): void {
  if (cache.__poller) return;
  const intervalMs = env.syncIntervalSeconds * 1000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await syncAllUsers();
    } catch (err) {
      console.error("Background sync failed:", err);
    } finally {
      running = false;
    }
  };

  cache.__poller = setInterval(tick, intervalMs);
  setTimeout(tick, FIRST_RUN_DELAY_MS);
  console.log(`Drive poller started (every ${intervalMs / 1000}s)`);
}
