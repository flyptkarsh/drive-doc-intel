import "server-only";
import type { SyncStatus } from "@/lib/types";
import { db } from "../db";

export type DriveConnection = {
  user_id: string;
  refresh_token_enc: string;
  google_email: string | null;
  folder_id: string | null;
  folder_name: string | null;
  last_synced_at: Date | null;
  last_sync_error: string | null;
};

export async function getConnection(userId: string): Promise<DriveConnection | null> {
  const sql = await db();
  const [conn] = await sql<DriveConnection[]>`
    select user_id, refresh_token_enc, google_email, folder_id, folder_name,
      last_synced_at, last_sync_error
    from drive_connections where user_id = ${userId}`;
  return conn ?? null;
}

export async function saveConnection(
  userId: string,
  refreshTokenEnc: string,
  googleEmail: string | null,
): Promise<void> {
  const sql = await db();
  await sql`
    insert into drive_connections (user_id, refresh_token_enc, google_email)
    values (${userId}, ${refreshTokenEnc}, ${googleEmail})
    on conflict (user_id) do update
      set refresh_token_enc = excluded.refresh_token_enc,
          google_email = excluded.google_email,
          last_sync_error = null`;
}

/** Removes the connection and everything ingested through it. */
export async function deleteConnection(userId: string): Promise<void> {
  const sql = await db();
  await sql.begin(async (tx) => {
    await tx`delete from documents where user_id = ${userId}`;
    await tx`delete from drive_connections where user_id = ${userId}`;
  });
}

/** Points the connection at a folder; switching folders clears the old folder's documents. */
export async function setFolder(userId: string, folderId: string, folderName: string | null) {
  const sql = await db();
  await sql.begin(async (tx) => {
    await tx`
      delete from documents where user_id = ${userId}
        and exists (select 1 from drive_connections c
                    where c.user_id = ${userId} and c.folder_id is distinct from ${folderId})`;
    await tx`
      update drive_connections
      set folder_id = ${folderId}, folder_name = ${folderName}, last_sync_error = null
      where user_id = ${userId}`;
  });
}

export async function recordSyncResult(userId: string, error: string | null): Promise<void> {
  const sql = await db();
  await sql`
    update drive_connections set last_synced_at = now(), last_sync_error = ${error}
    where user_id = ${userId}`;
}

export async function listSyncableUserIds(): Promise<string[]> {
  const sql = await db();
  const rows = await sql<{ user_id: string }[]>`
    select user_id from drive_connections where folder_id is not null`;
  return rows.map((r) => r.user_id);
}

export async function getSyncStatus(userId: string, syncing: boolean): Promise<SyncStatus> {
  const sql = await db();
  const conn = await getConnection(userId);
  const counts = await sql<{ status: string; n: number }[]>`
    select status, count(*)::int as n from documents where user_id = ${userId} group by status`;
  return {
    connected: !!conn,
    connection: conn && {
      google_email: conn.google_email,
      folder_id: conn.folder_id,
      folder_name: conn.folder_name,
      last_synced_at: conn.last_synced_at?.toISOString() ?? null,
      last_sync_error: conn.last_sync_error,
    },
    syncing,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
  };
}
