import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isSyncing } from "@/lib/sync";

export const GET = handler(async () => {
  const user = await requireUser();
  const sql = await db();
  const [conn] = await sql`
    select google_email, folder_id, folder_name, last_synced_at, last_sync_error
    from drive_connections where user_id = ${user.id}`;
  const counts = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from documents where user_id = ${user.id} group by status`;
  return NextResponse.json({
    connected: !!conn,
    connection: conn ?? null,
    syncing: isSyncing(user.id),
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
  });
});
