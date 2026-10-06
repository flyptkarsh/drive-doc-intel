import "server-only";
import { getConnection, listSyncableUserIds, recordSyncResult } from "./queries/connections";
import {
  deleteDocument,
  insertDocument,
  knownFundNames,
  listDocumentStates,
  listPendingDocuments,
  markFailed,
  markProcessing,
  saveExtraction,
  updateDocumentFromDrive,
  type DocumentState,
  type PendingDocument,
} from "./queries/documents";
import { downloadFile, driveClient, listFolderFiles, type Drive, type DriveFile } from "./drive";
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
};

const running = new Map<string, Promise<SyncResult>>();

/**
 * Brings a user's documents in line with their Drive folder: new and changed
 * files are (re)extracted and files no longer in the folder are dropped.
 * Concurrent calls for the same user share one run.
 */
export function syncUser(userId: string): Promise<SyncResult> {
  const existing = running.get(userId);
  if (existing) return existing;
  const run = runSync(userId).finally(() => running.delete(userId));
  running.set(userId, run);
  return run;
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
  const result: SyncResult = { added: 0, updated: 0, removed: 0, processed: 0, failed: 0 };
  const conn = await getConnection(userId);
  if (!conn?.folder_id) return result;

  try {
    const client = driveClient(conn.refresh_token_enc);
    const files = await listFolderFiles(client, conn.folder_id);
    await reconcile(userId, files, await listDocumentStates(userId), result);

    const filesById = new Map(files.map((f) => [f.id, f]));
    const queue = await listPendingDocuments(userId);
    const worker = async () => {
      for (let doc = queue.shift(); doc; doc = queue.shift()) {
        const ok = await processDocument(userId, client, doc, filesById.get(doc.drive_file_id));
        result[ok ? "processed" : "failed"]++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    await recordSyncResult(userId, null);
    return result;
  } catch (err) {
    await recordSyncResult(userId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** Diffs Drive against the database, queueing new and changed files. */
async function reconcile(
  userId: string,
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
      await insertDocument(userId, file);
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
  doc: PendingDocument,
  file: DriveFile | undefined,
): Promise<boolean> {
  await markProcessing(doc.id);
  try {
    const { bytes, mimeType } = await downloadFile(
      client,
      file ?? { id: doc.drive_file_id, mimeType: doc.mime_type },
    );
    const content = await prepareContent(doc.name, mimeType, bytes);
    const extraction = await extractDocument(
      doc.name,
      content,
      await knownFundNames(userId, doc.id),
    );
    await saveExtraction(userId, doc.id, extraction, content.text);
    return true;
  } catch (err) {
    console.error(`Failed to process "${doc.name}":`, err);
    await markFailed(doc.id, err instanceof Error ? err.message : String(err));
    return false;
  }
}
