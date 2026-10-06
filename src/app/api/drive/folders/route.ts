import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { driveFor, FOLDER_MIME } from "@/lib/google";
import { requireUser } from "@/lib/session";

// Lists folders for the folder picker: children of `parent` (default: My Drive root), or a name search.
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const parent = url.searchParams.get("parent") || "root";
  const q = url.searchParams.get("q")?.trim();
  const sql = await db();
  const [conn] = await sql<{ refresh_token_enc: string }[]>`
    select refresh_token_enc from drive_connections where user_id = ${user.id}`;
  if (!conn) return NextResponse.json({ error: "Drive not connected" }, { status: 400 });

  const drive = driveFor(conn.refresh_token_enc);
  const escaped = (q ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: q
      ? `mimeType = '${FOLDER_MIME}' and trashed = false and name contains '${escaped}'`
      : `mimeType = '${FOLDER_MIME}' and trashed = false and '${parent.replace(/'/g, "")}' in parents`,
    fields: "files(id, name, modifiedTime)",
    orderBy: "name",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return NextResponse.json({ folders: res.data.files ?? [] });
});
