import { db } from "./db";
import { downloadFile, driveFor, listFolderFiles, type DriveFile } from "./google";
import { prepareContent } from "./content";
import { extractDocument, isoDate } from "./extract";

const CONCURRENCY = 3;
const running = new Map<string, Promise<SyncResult>>();

export type SyncResult = { added: number; updated: number; removed: number; processed: number; failed: number };

type Connection = {
  user_id: string;
  refresh_token_enc: string;
  folder_id: string | null;
};

/**
 * Brings a user's documents in line with their Drive folder: new and changed
 * files are (re)extracted, files no longer in the folder are dropped. Calls for
 * the same user while one is running share that run.
 */
export function syncUser(userId: string): Promise<SyncResult> {
  const existing = running.get(userId);
  if (existing) return existing;
  const run = doSync(userId).finally(() => running.delete(userId));
  running.set(userId, run);
  return run;
}

export function isSyncing(userId: string) {
  return running.has(userId);
}

async function doSync(userId: string): Promise<SyncResult> {
  const sql = await db();
  const [conn] = await sql<Connection[]>`
    select user_id, refresh_token_enc, folder_id from drive_connections where user_id = ${userId}`;
  const result: SyncResult = { added: 0, updated: 0, removed: 0, processed: 0, failed: 0 };
  if (!conn?.folder_id) return result;

  try {
    const drive = driveFor(conn.refresh_token_enc);
    const files = await listFolderFiles(drive, conn.folder_id);
    const seen = new Set(files.map((f) => f.id));

    const existing = await sql<{ id: string; drive_file_id: string; drive_modified_at: Date | null; md5: string | null; status: string }[]>`
      select id, drive_file_id, drive_modified_at, md5, status from documents where user_id = ${userId}`;
    const byDriveId = new Map(existing.map((d) => [d.drive_file_id, d]));

    for (const doc of existing) {
      if (!seen.has(doc.drive_file_id)) {
        await sql`delete from documents where id = ${doc.id}`;
        result.removed++;
      }
    }

    for (const f of files) {
      const prev = byDriveId.get(f.id);
      const modified = f.modifiedTime ? new Date(f.modifiedTime) : null;
      if (!prev) {
        await sql`
          insert into documents (user_id, drive_file_id, name, mime_type, web_view_link, drive_modified_at, md5, size_bytes, status)
          values (${userId}, ${f.id}, ${f.name}, ${f.mimeType}, ${f.webViewLink}, ${modified}, ${f.md5Checksum}, ${f.size}, 'pending')`;
        result.added++;
      } else {
        const changed =
          (f.md5Checksum && f.md5Checksum !== prev.md5) ||
          (!f.md5Checksum && modified && prev.drive_modified_at && modified.getTime() !== prev.drive_modified_at.getTime());
        await sql`
          update documents set name = ${f.name}, web_view_link = ${f.webViewLink},
            drive_modified_at = ${modified}, md5 = ${f.md5Checksum}, size_bytes = ${f.size},
            status = ${changed ? "pending" : prev.status}
          where id = ${prev.id}`;
        if (changed) result.updated++;
      }
    }

    // Anything pending (new, changed, or left over from an interrupted run) gets processed.
    const pending = await sql<{ id: string; drive_file_id: string; name: string; mime_type: string }[]>`
      select id, drive_file_id, name, mime_type from documents
      where user_id = ${userId} and status in ('pending', 'processing')
      order by created_at`;

    const fileById = new Map(files.map((f) => [f.id, f]));
    const queue = [...pending];
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        for (let doc = queue.shift(); doc; doc = queue.shift()) {
          const file = fileById.get(doc.drive_file_id) ?? {
            id: doc.drive_file_id,
            mimeType: doc.mime_type,
          };
          const ok = await processDocument(userId, doc.id, doc.name, file, drive);
          if (ok) result.processed++;
          else result.failed++;
        }
      }),
    );

    await sql`update drive_connections set last_synced_at = now(), last_sync_error = null where user_id = ${userId}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`update drive_connections set last_synced_at = now(), last_sync_error = ${message} where user_id = ${userId}`;
    throw err;
  }
  return result;
}

async function processDocument(
  userId: string,
  documentId: string,
  name: string,
  file: Pick<DriveFile, "id" | "mimeType">,
  drive: ReturnType<typeof driveFor>,
): Promise<boolean> {
  const sql = await db();
  await sql`update documents set status = 'processing', error = null where id = ${documentId}`;
  try {
    const { bytes, mimeType } = await downloadFile(drive, file);
    const content = await prepareContent(name, mimeType, bytes);
    const known = await sql<{ fund_name: string }[]>`
      select distinct fund_name from funds where user_id = ${userId} and document_id <> ${documentId} order by fund_name`;
    const x = await extractDocument(name, content, known.map((k) => k.fund_name));

    await sql.begin(async (tx) => {
      await tx`delete from funds where document_id = ${documentId}`;
      await tx`delete from performance where document_id = ${documentId}`;
      await tx`delete from metrics where document_id = ${documentId}`;

      if (x.funds.length) {
        await tx`insert into funds ${tx(
          x.funds.map((f) => ({
            document_id: documentId, user_id: userId, fund_name: f.fund_name,
            share_class: f.share_class, isin: f.isin, ticker: f.ticker,
            strategy: f.strategy, asset_class: f.asset_class,
          })),
        )}`;
      }
      if (x.performance.length) {
        await tx`insert into performance ${tx(
          x.performance.map((p) => ({
            document_id: documentId, user_id: userId, fund_name: p.fund_name,
            share_class: p.share_class, period_type: p.period_type, period_label: p.period_label,
            period_start: isoDate(p.period_start), period_end: isoDate(p.period_end),
            return_pct: p.return_pct, benchmark_name: p.benchmark_name,
            benchmark_return_pct: p.benchmark_return_pct, is_annualized: p.is_annualized,
            net_or_gross: p.net_or_gross, currency: x.currency,
          })),
        )}`;
      }
      if (x.metrics.length) {
        await tx`insert into metrics ${tx(
          x.metrics.map((m) => ({
            document_id: documentId, user_id: userId, fund_name: m.fund_name, name: m.name,
            value_number: m.value_number, value_text: m.value_text, unit: m.unit,
            as_of_date: isoDate(m.as_of_date) ?? isoDate(x.as_of_date),
          })),
        )}`;
      }
      await tx`
        update documents set status = 'done', error = null, processed_at = now(),
          document_type = ${x.document_type}, title = ${x.title}, manager = ${x.manager},
          as_of_date = ${isoDate(x.as_of_date)}, currency = ${x.currency}, summary = ${x.summary},
          extraction = ${tx.json(x as never)}, text_content = ${content.text.replace(/\u0000/g, "")}
        where id = ${documentId}`;
    });
    return true;
  } catch (err) {
    console.error(`Failed to process ${name}:`, err);
    const message = err instanceof Error ? err.message : String(err);
    await sql`update documents set status = 'error', error = ${message}, processed_at = now() where id = ${documentId}`;
    return false;
  }
}

/** Marks one document for reprocessing and kicks off a sync. */
export async function reprocess(userId: string, documentId: string) {
  const sql = await db();
  await sql`update documents set status = 'pending' where id = ${documentId} and user_id = ${userId}`;
  void syncUser(userId).catch(() => {});
}

/** Syncs every connected user; used by the background poller and the cron endpoint. */
export async function syncAll() {
  const sql = await db();
  const users = await sql<{ user_id: string }[]>`
    select user_id from drive_connections where folder_id is not null`;
  for (const { user_id } of users) {
    try {
      await syncUser(user_id);
    } catch (err) {
      console.error(`Sync failed for ${user_id}:`, err);
    }
  }
}
