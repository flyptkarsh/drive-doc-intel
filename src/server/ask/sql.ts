import "server-only";
import type { Sql } from "../db";

/**
 * The only relations model-written SQL can see. Each is a CTE pre-filtered to
 * the signed-in user ($1), shadowing the real tables of the same name.
 */
const SCOPED_TABLES = `
documents as (
  select id, name, document_type, title, manager, as_of_date, currency, summary,
    web_view_link, drive_modified_at, processed_at
  from public.documents where user_id = $1 and status = 'done'),
funds as (
  select document_id, fund_name, share_class, isin, ticker, strategy, asset_class
  from public.funds where user_id = $1),
performance as (
  select document_id, fund_name, share_class, period_type, period_label, period_start,
    period_end, return_pct, benchmark_name, benchmark_return_pct, is_annualized,
    net_or_gross, currency
  from public.performance where user_id = $1),
metrics as (
  select document_id, fund_name, name, value_number, value_text, unit, as_of_date
  from public.metrics where user_id = $1)`;

export const SCHEMA_DESCRIPTION = `Tables (PostgreSQL):
documents(id uuid, name text, document_type text, title text, manager text, as_of_date date, currency text, summary text, web_view_link text, drive_modified_at timestamptz, processed_at timestamptz)
funds(document_id uuid, fund_name text, share_class text, isin text, ticker text, strategy text, asset_class text)
performance(document_id uuid, fund_name text, share_class text, period_type text, period_label text, period_start date, period_end date, return_pct numeric, benchmark_name text, benchmark_return_pct numeric, is_annualized boolean, net_or_gross text, currency text)
metrics(document_id uuid, fund_name text, name text, value_number numeric, value_text text, unit text, as_of_date date)

performance.period_type is one of: month, quarter, ytd, 1y, 3y, 5y, 10y, since_inception, calendar_year, other.
return_pct and benchmark_return_pct are percentages (1.25 means +1.25%).
document_type is one of: fund_factsheet, account_statement, performance_report, investor_letter, transaction_confirmation, market_commentary, other.
metrics.name is snake_case, e.g. aum, nav, account_value, sharpe_ratio, volatility, max_drawdown, management_fee.`;

const MAX_ROWS = 200;
const STATEMENT_TIMEOUT_MS = 5_000;

const FORBIDDEN = [
  /;/, // a single statement only
  /\b(insert|update|delete|merge|truncate|alter|drop|create|grant|revoke)\b/i, // no writes or DDL, even inside a CTE
  /\b(public|pg_catalog|information_schema)\s*\./i, // no schema-qualified names
  /\bpg_\w+/i, // no system functions or catalogs
  /\b(users|drive_connections)\b/i, // no tables outside the scoped set
  /\b(set_config|current_setting|dblink|lo_\w+|copy)\b/i,
];

export class UnsafeQueryError extends Error {
  override name = "UnsafeQueryError";
}

/** Validates model-written SQL and returns it normalized, or throws UnsafeQueryError. */
export function validateQuery(query: string): string {
  const normalized = query.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new UnsafeQueryError("Only SELECT queries are allowed.");
  }
  if (FORBIDDEN.some((pattern) => pattern.test(normalized))) {
    throw new UnsafeQueryError("Query references something outside the allowed tables.");
  }
  return normalized;
}

/**
 * Runs a validated query against the user's data only: scoped CTEs, a
 * read-only transaction, a statement timeout and a row cap.
 */
export async function runScopedQuery(sql: Sql, userId: string, query: string) {
  const wrapped = `with ${SCOPED_TABLES} select * from (${validateQuery(query)}) as result limit ${MAX_ROWS}`;
  return sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    return tx.unsafe(wrapped, [userId]);
  });
}

/** Full-text search over the user's documents, with highlighted excerpts. */
export async function searchDocuments(sql: Sql, userId: string, query: string) {
  return sql`
    select id, name, title, manager, as_of_date, document_type, summary,
      ts_headline('english', coalesce(text_content, ''),
        websearch_to_tsquery('english', ${query}),
        'MaxFragments=3, MaxWords=30, MinWords=10') as excerpt
    from documents
    where user_id = ${userId} and status = 'done'
      and search @@ websearch_to_tsquery('english', ${query})
    order by ts_rank(search, websearch_to_tsquery('english', ${query})) desc
    limit 8`;
}
