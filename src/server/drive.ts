import "server-only";
import { drive, type drive_v3 } from "@googleapis/drive";
import type { DriveFolder } from "@/lib/types";
import { decrypt } from "./crypto";
import { oauthClient } from "./google";
import { HttpError } from "./http";

export type Drive = drive_v3.Drive;

const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const MAX_FOLDER_DEPTH = 3;

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "text/html",
  "text/csv",
  "text/plain",
  "message/rfc822",
  GOOGLE_DOC_MIME,
  GOOGLE_SHEET_MIME,
]);
const SUPPORTED_EXTENSION = /\.(pdf|html?|csv|eml|txt)$/i;
/** Google-native types other than Docs and Sheets (Slides, Forms, shortcuts…) can't be read. */
const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";

/** Larger files are refused before download: they risk running the server out of memory. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_PICKER_FOLDERS = 500;

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: Date | null;
  md5Checksum: string | null;
  size: number | null;
  webViewLink: string | null;
};

export function isSupported(file: { name?: string | null; mimeType?: string | null }): boolean {
  const mimeType = file.mimeType ?? "";
  if (SUPPORTED_MIME.has(mimeType)) return true;
  // A shortcut or Slides file can be *named* "report.pdf" but can't be downloaded as one.
  if (mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) return false;
  return SUPPORTED_EXTENSION.test(file.name ?? "");
}

/**
 * Confirms the watched folder still exists and isn't trashed. Drive answers a
 * listing of a missing folder with an empty list rather than an error, which
 * would otherwise look like every file was deleted.
 */
export async function assertFolderAccessible(client: Drive, folderId: string): Promise<void> {
  const missing = new Error(
    "The watched folder was deleted, trashed or is no longer shared with you. Choose a folder again.",
  );
  const res = await client.files
    .get({ fileId: folderId, fields: "id, trashed, mimeType", supportsAllDrives: true })
    .catch((err: { code?: number; status?: number }) => {
      if (err.code === 404 || err.status === 404) throw missing;
      throw err;
    });
  if (res.data.trashed || res.data.mimeType !== FOLDER_MIME) throw missing;
}

/** Drive client authorized with a user's stored (encrypted) refresh token. */
export function driveClient(refreshTokenEnc: string): Drive {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: decrypt(refreshTokenEnc) });
  return drive({ version: "v3", auth });
}

/** Escapes a value for use inside a single-quoted Drive query string. */
function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** Turns Google API failures into messages the UI can show. */
function toHttpError(err: unknown): HttpError {
  const message = err instanceof Error ? err.message : String(err);
  return new HttpError(502, `Google Drive: ${message}`);
}

/** Folders for the picker: children of `parentId`, or every folder whose name matches `search`. */
export async function listFolders(
  client: Drive,
  { parentId = "root", search }: { parentId?: string; search?: string },
): Promise<DriveFolder[]> {
  const scope = search ? `name contains ${quote(search)}` : `${quote(parentId)} in parents`;
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const res = await client.files.list({
        q: `mimeType = '${FOLDER_MIME}' and trashed = false and ${scope}`,
        fields: "nextPageToken, files(id, name)",
        orderBy: "name",
        pageSize: 200,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) folders.push({ id: f.id!, name: f.name ?? "Untitled" });
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && folders.length < MAX_PICKER_FOLDERS);
  } catch (err) {
    throw toHttpError(err);
  }
  return folders;
}

/** Every ingestible file in a folder, descending into subfolders. */
export async function listFolderFiles(
  client: Drive,
  folderId: string,
  depth = 0,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.files.list({
      q: `${quote(folderId)} in parents and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size, webViewLink)",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.mimeType === FOLDER_MIME) {
        if (depth < MAX_FOLDER_DEPTH)
          files.push(...(await listFolderFiles(client, f.id!, depth + 1)));
      } else if (isSupported(f)) {
        files.push({
          id: f.id!,
          name: f.name ?? "Untitled",
          mimeType: f.mimeType ?? "application/octet-stream",
          modifiedTime: f.modifiedTime ? new Date(f.modifiedTime) : null,
          md5Checksum: f.md5Checksum ?? null,
          size: f.size ? Number(f.size) : null,
          webViewLink: f.webViewLink ?? null,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

/** Downloads a file's bytes, exporting Google Docs to PDF and Sheets to CSV. */
export async function downloadFile(
  client: Drive,
  file: Pick<DriveFile, "id" | "mimeType">,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const exportAs =
    file.mimeType === GOOGLE_DOC_MIME
      ? "application/pdf"
      : file.mimeType === GOOGLE_SHEET_MIME
        ? "text/csv"
        : null;
  const res = exportAs
    ? await client.files
        .export({ fileId: file.id, mimeType: exportAs }, { responseType: "arraybuffer" })
        .catch((err: Error) => {
          if (/exportSizeLimitExceeded|too large to be exported/i.test(err.message)) {
            throw new Error("This Google Doc is too large for Google to export (10 MB limit).");
          }
          throw err;
        })
    : await client.files.get(
        { fileId: file.id, alt: "media", supportsAllDrives: true },
        { responseType: "arraybuffer" },
      );
  return { bytes: Buffer.from(res.data as ArrayBuffer), mimeType: exportAs ?? file.mimeType };
}
