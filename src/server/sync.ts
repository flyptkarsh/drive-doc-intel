import "server-only";
import { getConnection, listSyncableUserIds, recordSyncResult } from "./queries/connections";
import {
  deleteDocument,
  insertDocument,
  knownFundNames,
  listDocumentStates,
  claimNextDocument,
  ClaimLostError,
  markFailed,
  saveExtraction,
  updateDocumentFromDrive,
  type DocumentState,
  type ClaimedDocument,
} from "./queries/documents";
import {
  assertFolderAccessible,
  downloadFile,
  driveClient,
  listFolderFiles,
  MAX_FILE_BYTES,
  type Drive,
  type DriveFile,
} from "./drive";
import { describeError } from "./errors";
import { prepareContent } from "./extraction/content";
import { extractDocument } from "./extraction/extract";

/** Documents extracted in parallel per user. */
const CONCURRENCY = 3;

export type SyncResult = {
  added: number;
  updated: number;
  removed: number;
  processed: number;
  failed: number;
  /** Results discarded because the file changed or another worker took over mid-extraction. */
  superseded: number;
};

const running = new Map<string, Promise<SyncResult>>();
const rerunRequested = new Set<string>();

/**
 * Brings a user's documents in line with their Drive folder: new and changed
 * files are (re)extracted and files no longer in the folder are dropped.
 *
 * Calls for a user who is already syncing share that run, and schedule one more
 * pass after it, so changes made mid-run (a new folder, a retry) aren't missed.
 */
export function syncUser(userId: string): Promise<SyncResult> {
  const existing = running.get(userId);
  if (existing) {
    rerunRequested.add(userId);
    return existing;
  }
  const run = (async () => {
    let result: SyncResult;
    do {
      rerunRequested.delete(userId);
      result = await runSync(userId);
    } while (rerunRequested.has(userId));
    return result;
  })().finally(() => running.delete(userId));
  running.set(userId, run);
  return run;
}

/** Starts a sync without waiting for it, logging rather than dropping any failure. */
export function syncInBackground(userId: string): void {
  syncUser(userId).catch((err) => console.error(`Sync failed for user ${userId}:`, err));
}

export function isSyncing(userId: string): boolean {
  return running.has(userId);
}

/** Syncs every user with a watched folder, one at a time. */
export async function syncAllUsers(): Promise<void> {
  for (const userId of await listSyncableUserIds()) {
    await syncUser(userId).catch((err) => console.error(`Sync failed for user ${userId}:`, err));
  }
}

async function runSync(userId: string): Promise<SyncResult> {
  const result: SyncResult = {
    added: 0,
    updated: 0,
    removed: 0,
    processed: 0,
    failed: 0,
    superseded: 0,
  };
  const conn = await getConnection(userId);
  if (!conn?.folder_id) return result;
  // Everything this run adds or claims is tied to the folder it started with.
  const folderId = conn.folder_id;
  const startedAt = Date.now();

  try {
    const client = driveClient(conn.refresh_token_enc);
    await assertFolderAccessible(client, folderId);
    const files = await listFolderFiles(client, folderId);
    await reconcile(userId, folderId, files, await listDocumentStates(userId), result);

    // Workers claim documents one at a time from the database, so concurrent
    // syncs (e.g. old and new instances during a deploy) never share a document.
    const filesById = new Map(files.map((f) => [f.id, f]));
    const worker = async () => {
      const next = () => claimNextDocument(userId, folderId);
      for (let doc = await next(); doc; doc = await next()) {
        const outcome = await processDocument(
          userId,
          client,
          doc,
          filesById.get(doc.drive_file_id),
        );
        result[outcome]++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    await recordSyncResult(userId, null);
    logSummary(userId, result, startedAt);
    return result;
  } catch (err) {
    await recordSyncResult(userId, describeError(err));
    throw err;
  }
}

/** Diffs Drive against the database, queueing new and changed files. */
async function reconcile(
  userId: string,
  folderId: string,
  files: DriveFile[],
  existing: DocumentState[],
  result: SyncResult,
): Promise<void> {
  const inDrive = new Set(files.map((f) => f.id));
  const known = new Map(existing.map((d) => [d.drive_file_id, d]));

  for (const doc of existing) {
    if (!inDrive.has(doc.drive_file_id)) {
      await deleteDocument(doc.id);
      result.removed++;
    }
  }
  for (const file of files) {
    const doc = known.get(file.id);
    if (!doc) {
      await insertDocument(userId, folderId, file);
      result.added++;
      continue;
    }
    const changed = hasChanged(doc, file);
    await updateDocumentFromDrive(doc.id, file, changed);
    if (changed) result.updated++;
  }
}

/** Compares content hashes, falling back to modified time for Google-native files. */
export function hasChanged(
  doc: Pick<DocumentState, "md5" | "drive_modified_at">,
  file: Pick<DriveFile, "md5Checksum" | "modifiedTime">,
): boolean {
  if (file.md5Checksum) return file.md5Checksum !== doc.md5;
  if (!file.modifiedTime || !doc.drive_modified_at) return false;
  return file.modifiedTime.getTime() !== doc.drive_modified_at.getTime();
}

async function processDocument(
  userId: string,
  client: Drive,
  doc: ClaimedDocument,
  file: DriveFile | undefined,
): Promise<"processed" | "failed" | "superseded"> {
  const startedAt = Date.now();
  const size = file?.size ?? (doc.size_bytes === null ? null : Number(doc.size_bytes));
  if (size !== null && size > MAX_FILE_BYTES) {
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    await markFailed(doc, `File is ${mb(size)} MB; the limit is ${mb(MAX_FILE_BYTES)} MB.`);
    return "failed";
  }
  try {
    const { bytes, mimeType } = await downloadFile(
      client,
      file ?? { id: doc.drive_file_id, mimeType: doc.mime_type },
    );
    const content = await prepareContent(doc.name, mimeType, bytes);
    const { extraction, usage } = await extractDocument(
      doc.name,
      content,
      await knownFundNames(userId, doc.id),
    );
    await saveExtraction(userId, doc, extraction, content.text);
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(
      `Extracted "${doc.name}" in ${seconds}s: ${extraction.performance.length} returns, ` +
        `${extraction.metrics.length} metrics, ${extraction.funds.length} funds ` +
        `(${usage.inputTokens} input / ${usage.outputTokens} output tokens)`,
    );
    return "processed";
  } catch (err) {
    if (err instanceof ClaimLostError) {
      console.log(`Discarded result for "${doc.name}": it changed or was re-queued meanwhile`);
      return "superseded";
    }
    console.error(`Failed to process "${doc.name}":`, err);
    await markFailed(doc, describeError(err));
    return "failed";
  }
}

function logSummary(userId: string, r: SyncResult, startedAt: number): void {
  const changed = r.added + r.updated + r.removed + r.processed + r.failed + r.superseded;
  if (changed === 0) return; // quiet polls stay out of the logs
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `Sync for user ${userId} in ${seconds}s: ${r.added} added, ${r.updated} changed, ` +
      `${r.removed} removed, ${r.processed} extracted, ${r.failed} failed, ${r.superseded} superseded`,
  );
}
