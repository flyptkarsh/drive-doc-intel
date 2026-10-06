import { describe, expect, it } from "vitest";
import { UnsafeQueryError, validateQuery } from "./sql";

describe("validateQuery", () => {
  it.each([
    "select fund_name, return_pct from performance order by return_pct desc",
    "SELECT count(*) FROM documents",
    "with jan as (select * from performance where extract(month from period_end) = 1) select * from jan",
    "select * from metrics where name = 'aum';",
    "select max(processed_at) as last_updated from documents",
  ])("allows %s", (query) => {
    expect(() => validateQuery(query)).not.toThrow();
  });

  it("strips a trailing semicolon", () => {
    expect(validateQuery("select 1;  ")).toBe("select 1");
  });

  it.each([
    ["writes", "delete from performance"],
    ["DDL", "drop table documents"],
    ["stacked statements", "select 1; drop table users"],
    ["data-modifying CTEs", "with d as (delete from performance returning *) select * from d"],
    ["tables outside the scope", "select * from users"],
    ["the connections table", "select refresh_token_enc from drive_connections"],
    ["schema-qualified names", "select * from public.performance"],
    ["system catalogs", "select * from pg_catalog.pg_tables"],
    ["system functions", "select pg_sleep(10)"],
    ["settings access", "select current_setting('is_superuser')"],
  ])("rejects %s", (_label, query) => {
    expect(() => validateQuery(query)).toThrow(UnsafeQueryError);
  });
});
