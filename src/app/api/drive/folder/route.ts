import { after } from "next/server";
import { z } from "zod";
import { authedRoute, badRequest, ok, readJson } from "@/server/http";
import { getConnection, setFolder } from "@/server/queries/connections";
import { syncUser } from "@/server/sync";

const Body = z.object({ id: z.string().min(1), name: z.string().nullish() });

/** Sets the folder to watch and starts the first sync. */
export const POST = authedRoute(async (req, user) => {
  const { id, name } = await readJson(req, Body);
  if (!(await getConnection(user.id))) throw badRequest("Google Drive isn't connected.");
  await setFolder(user.id, id, name ?? null);
  after(() => syncUser(user.id).catch(() => {}));
  return ok();
});
