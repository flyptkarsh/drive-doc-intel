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
    update documents set status = 'pending', error = null
    where id = ${documentId} and user_id = ${userId}
    returning id`;
  return rows.length > 0;
}

// ---- Sync bookkeeping ------------------------------------------------------

export type DocumentState = {
  id: string;
  drive_file_id: string;
  drive_modified_at: Date | null;
  md5: string | null;
  status: string;
};

export type PendingDocument = {
  id: string;
  drive_file_id: string;
  name: string;
  mime_type: string;
};

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

export async function insertDocument(userId: string, file: DriveFile): Promise<void> {
  const sql = await db();
  await sql`
    insert into documents (user_id, drive_file_id, name, mime_type, web_view_link,
      drive_modified_at, md5, size_bytes, status)
    values (${userId}, ${file.id}, ${file.name}, ${file.mimeType}, ${file.webViewLink},
      ${file.modifiedTime}, ${file.md5Checksum}, ${file.size}, 'pending')
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
      status = case when ${requeue} then 'pending' else status end
    where id = ${documentId}`;
}

export async function listPendingDocuments(userId: string): Promise<PendingDocument[]> {
  const sql = await db();
  // 'processing' rows are leftovers from an interrupted run and are picked up again.
  return sql<PendingDocument[]>`
    select id, drive_file_id, name, mime_type from documents
    where user_id = ${userId} and status in ('pending', 'processing')
    order by created_at`;
}

export async function markProcessing(documentId: string): Promise<void> {
  const sql = await db();
  await sql`update documents set status = 'processing', error = null where id = ${documentId}`;
}

export async function markFailed(documentId: string, error: string): Promise<void> {
  const sql = await db();
  await sql`
    update documents set status = 'error', error = ${error}, processed_at = now()
    where id = ${documentId}`;
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
  documentId: string,
  x: Extraction,
  textContent: string,
): Promise<void> {
  const sql = await db();
  await sql.begin(async (tx) => {
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
      update documents set status = 'done', error = null, processed_at = now(),
        document_type = ${x.document_type}, title = ${x.title}, manager = ${x.manager},
        as_of_date = ${normalizeDate(x.as_of_date)}, currency = ${x.currency},
        summary = ${x.summary}, extraction = ${tx.json(x as never)},
        text_content = ${textContent.replace(/\u0000/g, "")}
      where id = ${documentId}`;
  });
}
