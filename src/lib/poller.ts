import { env } from "./env";
import { syncAll } from "./sync";

declare global {
  var __poller: NodeJS.Timeout | undefined;
}

/** Polls every connected Drive folder so new files are picked up automatically. */
export function startPoller() {
  if (globalThis.__poller) return;
  const ms = Math.max(15, env.syncIntervalSeconds) * 1000;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await syncAll();
    } catch (err) {
      console.error("Background sync failed:", err);
    } finally {
      busy = false;
    }
  };
  globalThis.__poller = setInterval(tick, ms);
  setTimeout(tick, 5000);
  console.log(`Drive poller started (every ${ms / 1000}s)`);
}
