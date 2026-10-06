import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "./env";

// Refresh tokens are stored with AES-256-GCM so a database dump alone can't reach Drive.
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Encrypts to `iv.tag.ciphertext`, each part base64. */
export function encrypt(plain: string, secret = env.encryptionKey): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(token: string, secret = env.encryptionKey): string {
  const [iv, tag, data] = token.split(".").map((s) => Buffer.from(s, "base64"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv(ALGORITHM, key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
