import { after } from "next/server";
import { authedRoute, ok } from "@/server/http";
import { syncInBackground } from "@/server/sync";

/** Starts a sync in the background; the dashboard polls /api/status for progress. */
export const POST = authedRoute(async (_req, user) => {
  after(() => syncInBackground(user.id));
  return ok();
});
