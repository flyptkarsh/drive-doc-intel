import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const p = new URL(req.url).searchParams;
  const fund = p.get("fund") || null;
  const periodType = p.get("period_type") || null;
  const from = p.get("from") || null;
  const to = p.get("to") || null;
  const sql = await db();
  const rows = await sql`
    select p.id, p.document_id, d.name as document_name, d.manager, d.web_view_link,
      p.fund_name, p.share_class, p.period_type, p.period_label, p.period_start, p.period_end,
      p.return_pct, p.benchmark_name, p.benchmark_return_pct, p.is_annualized, p.net_or_gross, p.currency
    from performance p join documents d on d.id = p.document_id
    where p.user_id = ${user.id}
      ${fund ? sql`and p.fund_name = ${fund}` : sql``}
      ${periodType ? sql`and p.period_type = ${periodType}` : sql``}
      ${from ? sql`and p.period_end >= ${from}` : sql``}
      ${to ? sql`and p.period_end <= ${to}` : sql``}
    order by p.period_end desc nulls last, p.fund_name, p.period_type
    limit 5000`;
  const funds = await sql<{ fund_name: string }[]>`
    select distinct fund_name from performance where user_id = ${user.id} order by fund_name`;
  return NextResponse.json({ rows, funds: funds.map((f) => f.fund_name) });
});
