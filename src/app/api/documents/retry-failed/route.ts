import { after } from "next/server";
import { authedRoute, ok } from "@/server/http";
import { requeueFailed } from "@/server/queries/documents";
import { syncUser } from "@/server/sync";

/** Re-runs extraction for every failed document. */
export const POST = authedRoute(async (_req, user) => {
  const queued = await requeueFailed(user.id);
  if (queued > 0) after(() => syncUser(user.id).catch(() => {}));
  return ok({ queued });
});
