import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

const SECRET = "test-secret";

describe("encrypt/decrypt", () => {
  it("round-trips", () => {
    expect(decrypt(encrypt("1//refresh-token", SECRET), SECRET)).toBe("1//refresh-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same", SECRET)).not.toBe(encrypt("same", SECRET));
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const [iv, tag, data] = encrypt("secret", SECRET).split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."), SECRET)).toThrow();
    expect(() => decrypt(encrypt("secret", SECRET), "other-secret")).toThrow();
  });
});
