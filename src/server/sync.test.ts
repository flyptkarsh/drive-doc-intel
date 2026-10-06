import { describe, expect, it } from "vitest";
import { hasChanged } from "./sync";

const t = (iso: string) => new Date(iso);

describe("hasChanged", () => {
  it("compares md5 checksums when Drive provides one", () => {
    expect(
      hasChanged({ md5: "a", drive_modified_at: null }, { md5Checksum: "a", modifiedTime: null }),
    ).toBe(false);
    expect(
      hasChanged({ md5: "a", drive_modified_at: null }, { md5Checksum: "b", modifiedTime: null }),
    ).toBe(true);
  });

  it("falls back to modified time for Google-native files", () => {
    const doc = { md5: null, drive_modified_at: t("2026-01-01T00:00:00Z") };
    expect(hasChanged(doc, { md5Checksum: null, modifiedTime: t("2026-01-01T00:00:00Z") })).toBe(
      false,
    );
    expect(hasChanged(doc, { md5Checksum: null, modifiedTime: t("2026-02-01T00:00:00Z") })).toBe(
      true,
    );
  });

  it("treats missing timestamps as unchanged", () => {
    expect(
      hasChanged({ md5: null, drive_modified_at: null }, { md5Checksum: null, modifiedTime: null }),
    ).toBe(false);
  });
});
