import { after } from "next/server";
import { env } from "@/server/env";
import { HttpError, ok, route } from "@/server/http";
import { syncAllUsers } from "@/server/sync";

/** For an external scheduler: `Authorization: Bearer $CRON_SECRET`. */
export const POST = route(async (req) => {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized");
  }
  after(() => syncAllUsers().catch((err) => console.error("Cron sync failed:", err)));
  return ok();
});
