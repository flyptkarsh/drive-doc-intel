import "server-only";
import type { DocumentDetail, DocumentRow } from "@/lib/types";
import { db } from "../db";
import type { Extraction } from "../extraction/schema";
import { normalizeDate } from "../extraction/schema";
import type { DriveFile } from "../drive";

export async function listDocuments(userId: string, query?: string): Promise<DocumentRow[]> {
  const sql = await db();
  const search = query?.trim();
  return sql<DocumentRow[]>`
    select d.id, d.name, d.mime_type, d.web_view_link, d.status, d.error, d.document_type,
      d.title, d.manager, d.as_of_date, d.currency, d.summary, d.drive_modified_at, d.processed_at,
      (select count(*)::int from performance p where p.document_id = d.id) as performance_count,
      (select count(*)::int from metrics m where m.document_id = d.id) as metric_count,
      (select array_agg(distinct f.fund_name) from funds f where f.document_id = d.id) as funds
    from documents d
    where d.user_id = ${userId}
      ${
        search
          ? sql`and (d.search @@ websearch_to_tsquery('english', ${search})
                     or d.name ilike ${"%" + search + "%"})`
          : sql``
      }
    order by d.as_of_date desc nulls last, d.created_at desc`;
}

export async function getDocumentDetail(
  userId: string,
  documentId: string,
): Promise<DocumentDetail | null> {
  const sql = await db();
  const [document] = await sql<DocumentDetail["document"][]>`
    select id, name, mime_type, web_view_link, status, error, document_type, title, manager,
      as_of_date, currency, summary, drive_modified_at, processed_at, extraction
    from documents where id = ${documentId} and user_id = ${userId}`;
  if (!document) return null;
  const [performance, metrics] = await Promise.all([
    sql<DocumentDetail["performance"]>`
      select fund_name, share_class, period_type, period_label, period_start, period_end,
        return_pct, benchmark_name, benchmark_return_pct, is_annualized, net_or_gross
      from performance where document_id = ${documentId}
      order by fund_name, period_end nulls last, period_type`,
    sql<DocumentDetail["metrics"]>`
      select fund_name, name, value_number, value_text, unit, as_of_date
      from metrics where document_id = ${documentId}
      order by fund_name nulls first, name`,
  ]);
  return { document, performance, metrics };
}

/** Queues a document for re-extraction. Returns false if it doesn't exist. */
export async function markPending(userId: string, documentId: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    update documents set status = 'pending', error = null, claim_id = null
    where id = ${documentId} and user_id = ${userId}
    returning id`;
  return rows.length > 0;
}

/** Queues every failed document for another attempt. Returns how many were queued. */
export async function requeueFailed(userId: string): Promise<number> {
  const sql = await db();
  const rows = await sql`
    update documents set status = 'pending', error = null, claim_id = null
    where user_id = ${userId} and status = 'error'
    returning id`;
  return rows.length;
}

// ---- Sync bookkeeping ------------------------------------------------------

export type DocumentState = {
  id: string;
  drive_file_id: string;
  drive_modified_at: Date | null;
  md5: string | null;
  status: string;
};

/** A document a worker has claimed; only the holder of `claim_id` may record its result. */
export type ClaimedDocument = {
  id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
  size_bytes: number | null;
  claim_id: string;
};

/** Raised when a document's claim was taken over or cleared while it was being processed. */
export class ClaimLostError extends Error {
  override name = "ClaimLostError";
}

/** Claims older than this are assumed abandoned (crashed or replaced instance) and re-claimed. */
const CLAIM_TIMEOUT = "15 minutes";

/** Original text kept for full-text search; larger documents are truncated. */
const MAX_STORED_TEXT_CHARS = 2_000_000;

export async function listDocumentStates(userId: string): Promise<DocumentState[]> {
  const sql = await db();
  return sql<DocumentState[]>`
    select id, drive_file_id, drive_modified_at, md5, status
    from documents where user_id = ${userId}`;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const sql = await db();
  await sql`delete from documents where id = ${documentId}`;
}

/**
 * Adds a newly seen file, but only while `folderId` is still the user's watched
 * folder, so a sync of a folder the user just switched away from adds nothing.
 */
export async function insertDocument(
  userId: string,
  folderId: string,
  file: DriveFile,
): Promise<void> {
  const sql = await db();
  await sql`
    insert into documents (user_id, drive_file_id, name, mime_type, web_view_link,
      drive_modified_at, md5, size_bytes, status)
    select ${userId}, ${file.id}, ${file.name}, ${file.mimeType}, ${file.webViewLink},
      ${file.modifiedTime}, ${file.md5Checksum}, ${file.size}, 'pending'
    where exists (select 1 from drive_connections
                  where user_id = ${userId} and folder_id = ${folderId})
    on conflict (user_id, drive_file_id) do nothing`;
}

export async function updateDocumentFromDrive(
  documentId: string,
  file: DriveFile,
  requeue: boolean,
): Promise<void> {
  const sql = await db();
  await sql`
    update documents set name = ${file.name}, web_view_link = ${file.webViewLink},
      drive_modified_at = ${file.modifiedTime}, md5 = ${file.md5Checksum}, size_bytes = ${file.size},
      status = case when ${requeue} then 'pending' else status end,
      -- Re-queuing voids any in-flight claim so a stale result can't overwrite the new version.
      claim_id = case when ${requeue} then null else claim_id end
    where id = ${documentId}`;
}

/**
 * Atomically claims the user's next document to process: a pending one, or one
 * whose claim has expired. Safe to call from several workers and instances at
 * once; each document goes to exactly one caller.
 */
export async function claimNextDocument(
  userId: string,
  folderId: string,
): Promise<ClaimedDocument | null> {
  const sql = await db();
  const [doc] = await sql<ClaimedDocument[]>`
    update documents
    set status = 'processing', error = null, claim_id = gen_random_uuid(), claimed_at = now()
    where id = (
      select id from documents
      where user_id = ${userId}
        -- Stop claiming once the user switches folders or disconnects.
        and exists (select 1 from drive_connections
                    where user_id = ${userId} and folder_id = ${folderId})
        and (status = 'pending'
             or (status = 'processing'
                 and (claimed_at is null or claimed_at < now() - ${CLAIM_TIMEOUT}::interval)))
      order by created_at
      limit 1
      for update skip locked
    )
    returning id, drive_file_id, name, mime_type, size_bytes, claim_id`;
  return doc ?? null;
}

/** Records a failure, unless the claim has since been taken over or voided. */
export async function markFailed(doc: ClaimedDocument, error: string): Promise<void> {
  const sql = await db();
  await sql`
    update documents
    set status = 'error', error = ${error}, processed_at = now(), claim_id = null
    where id = ${doc.id} and claim_id = ${doc.claim_id}`;
}

/** Fund names from the user's other documents, used to keep naming consistent. */
export async function knownFundNames(userId: string, excludeDocumentId: string): Promise<string[]> {
  const sql = await db();
  const rows = await sql<{ fund_name: string }[]>`
    select distinct fund_name from funds
    where user_id = ${userId} and document_id <> ${excludeDocumentId}
    order by fund_name`;
  return rows.map((r) => r.fund_name);
}

/** Replaces a document's extracted rows and marks it done, atomically. */
export async function saveExtraction(
  userId: string,
  doc: ClaimedDocument,
  x: Extraction,
  textContent: string,
): Promise<void> {
  const sql = await db();
  const documentId = doc.id;
  await sql.begin(async (tx) => {
    // Lock the row and confirm we still own it; otherwise discard this result.
    const owned = await tx`
      select 1 from documents where id = ${documentId} and claim_id = ${doc.claim_id} for update`;
    if (owned.length === 0) throw new ClaimLostError(`Claim on "${doc.name}" was lost`);

    await tx`delete from funds where document_id = ${documentId}`;
    await tx`delete from performance where document_id = ${documentId}`;
    await tx`delete from metrics where document_id = ${documentId}`;

    if (x.funds.length) {
      await tx`insert into funds ${tx(
        x.funds.map((f) => ({ ...f, document_id: documentId, user_id: userId })),
      )}`;
    }
    if (x.performance.length) {
      await tx`insert into performance ${tx(
        x.performance.map((p) => ({
          ...p,
          document_id: documentId,
          user_id: userId,
          period_start: normalizeDate(p.period_start),
          period_end: normalizeDate(p.period_end),
          currency: x.currency,
        })),
      )}`;
    }
    if (x.metrics.length) {
      await tx`insert into metrics ${tx(
        x.metrics.map((m) => ({
          ...m,
          document_id: documentId,
          user_id: userId,
          as_of_date: normalizeDate(m.as_of_date) ?? normalizeDate(x.as_of_date),
        })),
      )}`;
    }
    await tx`
      update documents set status = 'done', error = null, processed_at = now(), claim_id = null,
        document_type = ${x.document_type}, title = ${x.title}, manager = ${x.manager},
        as_of_date = ${normalizeDate(x.as_of_date)}, currency = ${x.currency},
        summary = ${x.summary}, extraction = ${tx.json(x as never)},
        text_content = ${textContent.slice(0, MAX_STORED_TEXT_CHARS).replace(/\u0000/g, "")}
      where id = ${documentId}`;
  });
}
