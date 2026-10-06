import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

// Refresh tokens are stored encrypted with AES-256-GCM, keyed off ENCRYPTION_KEY
// (falling back to SESSION_SECRET) so a database dump alone can't reach Drive.
function key() {
  return createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || env.sessionSecret)
    .digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
