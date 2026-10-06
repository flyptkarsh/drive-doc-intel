import { after } from "next/server";
import { z } from "zod";
import { authedRoute, notFound, ok } from "@/server/http";
import { getDocumentDetail, markPending } from "@/server/queries/documents";
import { syncUser } from "@/server/sync";

type Ctx = RouteContext<"/api/documents/[id]">;

/** The route's document ID; anything that isn't a UUID can't exist, so it's a 404. */
async function documentId(ctx: Ctx): Promise<string> {
  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

export const GET = authedRoute<Ctx>(async (_req, user, ctx) => {
  const detail = await getDocumentDetail(user.id, await documentId(ctx));
  if (!detail) throw notFound();
  return ok(detail);
});

/** Re-runs extraction for one document. */
export const POST = authedRoute<Ctx>(async (_req, user, ctx) => {
  if (!(await markPending(user.id, await documentId(ctx)))) throw notFound();
  after(() => syncUser(user.id).catch(() => {}));
  return ok();
});
