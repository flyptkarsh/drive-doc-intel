import { driveClient, listFolders } from "@/server/drive";
import { authedRoute, badRequest, ok } from "@/server/http";
import { getConnection } from "@/server/queries/connections";

/** Folders for the picker: `?parent=<id>` children (default My Drive) or `?q=<name>` search. */
export const GET = authedRoute(async (req, user) => {
  const conn = await getConnection(user.id);
  if (!conn) throw badRequest("Google Drive isn't connected.");
  const params = new URL(req.url).searchParams;
  const folders = await listFolders(driveClient(conn.refresh_token_enc), {
    parentId: params.get("parent") || undefined,
    search: params.get("q")?.trim() || undefined,
  });
  return ok({ folders });
});
