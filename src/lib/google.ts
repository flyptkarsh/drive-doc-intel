import { OAuth2Client } from "google-auth-library";
import { google, drive_v3 } from "googleapis";
import { env } from "./env";
import { decrypt } from "./crypto";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function oauthClient() {
  // "postmessage" is the redirect URI for codes issued by the Google Identity
  // Services popup (google.accounts.oauth2.initCodeClient).
  return new OAuth2Client(env.googleClientId, env.googleClientSecret, "postmessage");
}

/** Verifies a Google One Tap / Sign in with Google ID token credential. */
export async function verifyIdToken(credential: string) {
  const ticket = await new OAuth2Client(env.googleClientId).verifyIdToken({
    idToken: credential,
    audience: env.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new Error("Google account has no verified email");
  }
  return payload;
}

export function driveFor(refreshTokenEnc: string): drive_v3.Drive {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: decrypt(refreshTokenEnc) });
  return google.drive({ version: "v3", auth });
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Formats the app can ingest, keyed by Drive MIME type. */
export const SUPPORTED_MIME = new Set([
  "application/pdf",
  "text/html",
  "text/csv",
  "text/plain",
  "message/rfc822",
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
]);

export function isSupported(file: { name?: string | null; mimeType?: string | null }) {
  if (file.mimeType && SUPPORTED_MIME.has(file.mimeType)) return true;
  return /\.(pdf|html?|csv|eml|txt)$/i.test(file.name ?? "");
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  md5Checksum: string | null;
  size: number | null;
  webViewLink: string | null;
};

/** Lists ingestible files in a folder, descending into subfolders. */
export async function listFolderFiles(
  drive: drive_v3.Drive,
  folderId: string,
  depth = 0,
): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, md5Checksum, size, webViewLink)",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.mimeType === FOLDER_MIME) {
        if (depth < 3) out.push(...(await listFolderFiles(drive, f.id!, depth + 1)));
      } else if (isSupported(f)) {
        out.push({
          id: f.id!,
          name: f.name ?? "Untitled",
          mimeType: f.mimeType ?? "application/octet-stream",
          modifiedTime: f.modifiedTime ?? null,
          md5Checksum: f.md5Checksum ?? null,
          size: f.size ? Number(f.size) : null,
          webViewLink: f.webViewLink ?? null,
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Downloads a file's bytes, exporting Google-native formats first. */
export async function downloadFile(
  drive: drive_v3.Drive,
  file: Pick<DriveFile, "id" | "mimeType">,
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (file.mimeType === "application/vnd.google-apps.document") {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: "application/pdf" },
      { responseType: "arraybuffer" },
    );
    return { bytes: Buffer.from(res.data as ArrayBuffer), mimeType: "application/pdf" };
  }
  if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await drive.files.export(
      { fileId: file.id, mimeType: "text/csv" },
      { responseType: "arraybuffer" },
    );
    return { bytes: Buffer.from(res.data as ArrayBuffer), mimeType: "text/csv" };
  }
  const res = await drive.files.get(
    { fileId: file.id, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return { bytes: Buffer.from(res.data as ArrayBuffer), mimeType: file.mimeType };
}
