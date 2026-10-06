import { authedRoute, ok } from "@/server/http";
import { listDocuments } from "@/server/queries/documents";

/** All documents, optionally filtered by `?q=` (full-text and file name). */
export const GET = authedRoute(async (req, user) => {
  const query = new URL(req.url).searchParams.get("q") ?? undefined;
  return ok({ documents: await listDocuments(user.id, query) });
});
