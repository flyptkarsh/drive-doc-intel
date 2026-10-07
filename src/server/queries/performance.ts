import "server-only";
import type { PerformanceResponse, PerformanceRow } from "@/lib/types";
import { db } from "../db";

export type PerformanceFilters = {
  fund?: string;
  periodType?: string;
  from?: string;
  to?: string;
};

const MAX_ROWS = 5000;

export async function listPerformance(
  userId: string,
  { fund, periodType, from, to }: PerformanceFilters,
): Promise<PerformanceResponse> {
  const sql = await db();
  const [rows, funds] = await Promise.all([
    sql<PerformanceRow[]>`
      select p.id, p.document_id, d.name as document_name, d.manager, d.web_view_link,
        p.fund_name, p.share_class, p.period_type, p.period_label, p.period_start, p.period_end,
        p.return_pct, p.benchmark_name, p.benchmark_return_pct, p.is_annualized,
        p.net_or_gross, p.currency
      from performance p join documents d on d.id = p.document_id
      where p.user_id = ${userId} and d.status = 'done'
        ${fund ? sql`and p.fund_name = ${fund}` : sql``}
        ${periodType ? sql`and p.period_type = ${periodType}` : sql``}
        ${from ? sql`and p.period_end >= ${from}` : sql``}
        ${to ? sql`and p.period_end <= ${to}` : sql``}
      order by p.period_end desc nulls last, p.fund_name, p.period_type
      limit ${MAX_ROWS + 1}`,
    sql<{ fund_name: string }[]>`
      select distinct fund_name from performance where user_id = ${userId} order by fund_name`,
  ]);
  return {
    rows: rows.slice(0, MAX_ROWS),
    funds: funds.map((f) => f.fund_name),
    truncated: rows.length > MAX_ROWS,
  };
}
