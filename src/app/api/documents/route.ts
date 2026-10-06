import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const sql = await db();
  const docs = await sql`
    select d.id, d.name, d.mime_type, d.web_view_link, d.status, d.error, d.document_type, d.title,
      d.manager, d.as_of_date, d.currency, d.summary, d.drive_modified_at, d.processed_at,
      (select count(*)::int from performance p where p.document_id = d.id) as performance_count,
      (select count(*)::int from metrics m where m.document_id = d.id) as metric_count,
      (select array_agg(distinct f.fund_name) from funds f where f.document_id = d.id) as funds
    from documents d
    where d.user_id = ${user.id}
      ${q ? sql`and (d.search @@ websearch_to_tsquery('english', ${q}) or d.name ilike ${"%" + q + "%"})` : sql``}
    order by d.as_of_date desc nulls last, d.created_at desc`;
  return NextResponse.json({ documents: docs });
});
