import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "../db";

// Runs against a real Postgres when TEST_DATABASE_URL is set (CI provides one).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("runScopedQuery (Postgres)", () => {
  let sql: Sql;
  let runScopedQuery: typeof import("./sql").runScopedQuery;
  let searchDocuments: typeof import("./sql").searchDocuments;
  let alice = "";
  let bob = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ runScopedQuery, searchDocuments } = await import("./sql"));
    sql = await (await import("../db")).db();

    const insertUser = async (sub: string) =>
      (
        await sql`insert into users (google_sub, email) values (${sub}, ${sub + "@test"}) returning id`
      )[0].id as string;
    alice = await insertUser(`alice-${crypto.randomUUID()}`);
    bob = await insertUser(`bob-${crypto.randomUUID()}`);

    for (const [userId, fund, ret] of [
      [alice, "Alpha Equity", 2.5],
      [alice, "Beta Income", -0.4],
      [bob, "Bob's Fund", 99],
    ] as const) {
      const [doc] = await sql`
        insert into documents (user_id, drive_file_id, name, mime_type, status, title, text_content)
        values (${userId}, ${crypto.randomUUID()}, ${fund + ".pdf"}, 'application/pdf', 'done',
                ${fund}, ${"Commentary: semiconductors drove returns for " + fund})
        returning id`;
      await sql`
        insert into performance (document_id, user_id, fund_name, period_type, period_label, period_end, return_pct)
        values (${doc.id}, ${userId}, ${fund}, 'month', 'Jan 2026', '2026-01-31', ${ret})`;
    }
  });

  afterAll(async () => {
    await sql`delete from users where id in (${alice}, ${bob})`;
    await sql.end();
  });

  it("only sees the signed-in user's rows", async () => {
    const rows = await runScopedQuery(
      sql,
      alice,
      "select fund_name, return_pct from performance order by return_pct desc",
    );
    expect(rows.map((r) => r.fund_name)).toEqual(["Alpha Equity", "Beta Income"]);
  });

  it("answers the January question", async () => {
    const [best] = await runScopedQuery(
      sql,
      alice,
      "select fund_name from performance where extract(month from period_end) = 1 order by return_pct desc limit 1",
    );
    expect(best.fund_name).toBe("Alpha Equity");
  });

  it("supports CTE queries", async () => {
    const [row] = await runScopedQuery(
      sql,
      alice,
      "with x as (select avg(return_pct) as avg_return from performance) select * from x",
    );
    expect(row.avg_return).toBeCloseTo(1.05);
  });

  it.each([
    'select count(*) from "public".documents',
    "select count(*) from public/**/.documents",
    "select query_to_xml('select count(*) from pu'||'blic.users', true, false, '')",
  ])("refuses to read other users' data via %s", async (query) => {
    await expect(runScopedQuery(sql, bob, query)).rejects.toThrow(/not allowed/);
  });

  it("scopes full-text search to the user", async () => {
    const rows = await searchDocuments(sql, alice, "semiconductors");
    expect(rows).toHaveLength(2);
  });
});
