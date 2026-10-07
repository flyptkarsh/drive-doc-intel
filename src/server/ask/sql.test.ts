import { describe, expect, it } from "vitest";
import { UnsafeQueryError, validateQuery } from "./sql-guard";

describe("validateQuery", () => {
  it.each([
    "select fund_name, return_pct from performance order by return_pct desc",
    "SELECT count(*) FROM documents",
    "with jan as (select * from performance where extract(month from period_end) = 1) select * from jan",
    "select * from metrics where name = 'aum';",
    "select max(processed_at) as last_updated from documents",
    "select p.fund_name, d.manager from performance p join documents d on d.id = p.document_id",
    "select fund_name, rank() over (order by return_pct desc) from performance",
    "select date_trunc('month', period_end), round(avg(return_pct)::numeric, 2) from performance group by 1",
    "select fund_name from performance where period_end > current_date - interval '1 year'",
    "select coalesce(benchmark_name, 'none'), nullif(return_pct, 0), greatest(1, 2) from performance",
    "select * from performance where fund_name ilike '%equity%' and period_type in ('month', 'ytd')",
    "select substring(fund_name from 1 for 10), trim(fund_name) from funds",
  ])("allows %s", async (query) => {
    await expect(validateQuery(query)).resolves.toBeTypeOf("string");
  });

  it("strips a trailing semicolon", async () => {
    await expect(validateQuery("select 1;  ")).resolves.toBe("select 1");
  });

  it.each([
    // writes and DDL
    ["writes", "delete from performance"],
    ["DDL", "drop table documents"],
    ["data-modifying CTEs", "with d as (delete from performance returning *) select * from d"],
    ["stacked statements", "select 1; drop table users"],
    ["SELECT INTO", "select * into stolen from documents"],
    ["row locks", "select * from performance for update"],
    // reaching other tables
    ["tables outside the scope", "select * from users"],
    ["the connections table", "select refresh_token_enc from drive_connections"],
    ["schema-qualified names", "select * from public.performance"],
    ["quoted schema names", 'select * from "public".documents'],
    ["comments between names", "select * from public/**/.documents"],
    ["case-folded quoted names", 'select * from "Documents"'],
    ["system catalogs", "select * from pg_catalog.pg_tables"],
    ["unqualified catalogs", "select * from pg_user"],
    ["information_schema", "select * from information_schema.tables"],
    // dynamic SQL and side effects through functions
    ["query_to_xml", "select query_to_xml('select * from pu'||'blic.users', true, false, '')"],
    ["schema-qualified functions", "select pg_catalog.query_to_xml('select 1', true, false, '')"],
    ["sleep", "select pg_sleep(10)"],
    ["settings", "select current_setting('is_superuser')"],
    ["set_config", "select set_config('app.user_id', 'x', true)"],
    ["file reads", "select pg_read_file('/etc/passwd')"],
    ["dblink", "select * from dblink('host=x', 'select 1') as t(a int)"],
    ["functions in FROM", "select * from generate_series(1, 10)"],
    ["current_user", "select current_user"],
    ["sequence writes", "select nextval('performance_id_seq')"],
    ["syntax errors", "select from where"],
  ])("rejects %s", async (_label, query) => {
    await expect(validateQuery(query)).rejects.toThrow(UnsafeQueryError);
  });

  it("explains unknown tables so the model can correct itself", async () => {
    await expect(validateQuery("select * from fund_returns")).rejects.toThrow(
      /Available: documents, funds, performance, metrics/,
    );
  });
});
