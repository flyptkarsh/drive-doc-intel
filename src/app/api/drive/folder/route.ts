import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

// Points the connection at a folder. Switching folders clears previously ingested documents.
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { id, name } = (await req.json()) as { id?: string; name?: string };
  if (!id) return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  const sql = await db();
  const [prev] = await sql<{ folder_id: string | null }[]>`
    select folder_id from drive_connections where user_id = ${user.id}`;
  if (!prev) return NextResponse.json({ error: "Drive not connected" }, { status: 400 });
  if (prev.folder_id !== id) {
    await sql`delete from documents where user_id = ${user.id}`;
  }
  await sql`update drive_connections set folder_id = ${id}, folder_name = ${name ?? null}, last_sync_error = null where user_id = ${user.id}`;
  void syncUser(user.id).catch(() => {});
  return NextResponse.json({ ok: true });
});
