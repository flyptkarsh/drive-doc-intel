import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "../db";
import type { Extraction } from "../extraction/schema";

// Runs against a real Postgres when TEST_DATABASE_URL is set (CI provides one).
const url = process.env.TEST_DATABASE_URL;

const emptyExtraction: Extraction = {
  document_type: "other",
  title: "Doc",
  manager: null,
  as_of_date: null,
  currency: null,
  summary: "",
  funds: [],
  performance: [],
  metrics: [],
};

describe.skipIf(!url)("document claims (Postgres)", () => {
  let sql: Sql;
  let q: typeof import("./documents");
  let userId = "";
  const folderId = "folder-a";

  const addDocument = async (name: string) => {
    const [row] = await sql`
      insert into documents (user_id, drive_file_id, name, mime_type, status)
      values (${userId}, ${crypto.randomUUID()}, ${name}, 'application/pdf', 'pending')
      returning id`;
    return row.id as string;
  };
  const statusOf = async (id: string) =>
    (await sql`select status from documents where id = ${id}`)[0].status as string;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    q = await import("./documents");
    sql = await (await import("../db")).db();
    const [user] = await sql`
      insert into users (google_sub, email) values (${"claims-" + crypto.randomUUID()}, 'c@test')
      returning id`;
    userId = user.id;
    await sql`
      insert into drive_connections (user_id, refresh_token_enc, folder_id)
      values (${userId}, 'unused', ${folderId})`;
  });

  beforeEach(async () => {
    await sql`delete from documents where user_id = ${userId}`;
  });

  afterAll(async () => {
    await sql`delete from users where id = ${userId}`;
    await sql.end();
  });

  it("gives each document to exactly one of many concurrent claimers", async () => {
    const ids = await Promise.all(["a", "b", "c"].map(addDocument));
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => q.claimNextDocument(userId, folderId)),
    );
    const claimed = claims.filter((c) => c !== null).map((c) => c.id);
    expect(claimed.sort()).toEqual([...ids].sort());
    expect(await q.claimNextDocument(userId, folderId)).toBeNull();
  });

  it("re-claims a document whose claim has expired", async () => {
    const id = await addDocument("stuck");
    await q.claimNextDocument(userId, folderId);
    expect(await q.claimNextDocument(userId, folderId)).toBeNull();
    await sql`update documents set claimed_at = now() - interval '1 hour' where id = ${id}`;
    expect((await q.claimNextDocument(userId, folderId))?.id).toBe(id);
  });

  it("saves a result only while the claim is held", async () => {
    await addDocument("doc");
    const claim = (await q.claimNextDocument(userId, folderId))!;
    await q.saveExtraction(userId, claim, emptyExtraction, "text");
    expect(await statusOf(claim.id)).toBe("done");
    await expect(q.saveExtraction(userId, claim, emptyExtraction, "text")).rejects.toThrow(
      q.ClaimLostError,
    );
  });

  it("stops claiming once the user switches to another folder", async () => {
    await addDocument("old-folder file");
    await sql`update drive_connections set folder_id = 'folder-b' where user_id = ${userId}`;
    try {
      expect(await q.claimNextDocument(userId, folderId)).toBeNull();
    } finally {
      await sql`update drive_connections set folder_id = ${folderId} where user_id = ${userId}`;
    }
  });

  it("only inserts files while their folder is still the watched one", async () => {
    const file = {
      id: crypto.randomUUID(),
      name: "new.pdf",
      mimeType: "application/pdf",
      modifiedTime: null,
      md5Checksum: null,
      size: 10,
      webViewLink: null,
    };
    await q.insertDocument(userId, "folder-b", file);
    expect(await sql`select 1 from documents where drive_file_id = ${file.id}`).toHaveLength(0);
    await q.insertDocument(userId, folderId, file);
    expect(await sql`select 1 from documents where drive_file_id = ${file.id}`).toHaveLength(1);
  });

  it("discards an in-flight result when the document is re-queued", async () => {
    await addDocument("doc");
    const claim = (await q.claimNextDocument(userId, folderId))!;
    await q.markPending(userId, claim.id); // e.g. the user clicked Re-extract mid-run
    await expect(q.saveExtraction(userId, claim, emptyExtraction, "")).rejects.toThrow(
      q.ClaimLostError,
    );
    await q.markFailed(claim, "late failure");
    expect(await statusOf(claim.id)).toBe("pending");
  });
});
