import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { reprocess } from "@/lib/sync";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const sql = await db();
  const [doc] = await sql`
    select id, name, mime_type, web_view_link, status, error, document_type, title, manager,
      as_of_date, currency, summary, drive_modified_at, processed_at, extraction
    from documents where id = ${id} and user_id = ${user.id}`;
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const performance = await sql`
    select fund_name, share_class, period_type, period_label, period_start, period_end, return_pct,
      benchmark_name, benchmark_return_pct, is_annualized, net_or_gross
    from performance where document_id = ${id} order by fund_name, period_end nulls last, period_type`;
  const metrics = await sql`
    select fund_name, name, value_number, value_text, unit, as_of_date
    from metrics where document_id = ${id} order by fund_name nulls first, name`;
  return NextResponse.json({ document: doc, performance, metrics });
});

// Re-runs extraction for one document.
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await reprocess(user.id, id);
  return NextResponse.json({ ok: true });
});
