import { db } from "@/server/db";
import { ok, route } from "@/server/http";

/** Liveness plus database reachability; used as Render's health check. */
export const GET = route(async () => {
  const sql = await db();
  await sql`select 1`;
  return ok();
});
