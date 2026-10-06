import { after } from "next/server";
import { authedRoute, ok } from "@/server/http";
import { syncUser } from "@/server/sync";

/** Starts a sync in the background; the dashboard polls /api/status for progress. */
export const POST = authedRoute(async (_req, user) => {
  after(() => syncUser(user.id).catch(() => {}));
  return ok();
});
