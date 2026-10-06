import { z } from "zod";
import { encrypt, decrypt } from "@/server/crypto";
import { exchangeDriveCode, revokeToken } from "@/server/google";
import { authedRoute, ok, readJson } from "@/server/http";
import { deleteConnection, getConnection, saveConnection } from "@/server/queries/connections";

const Body = z.object({ code: z.string().min(1) });

/** Stores Drive access from an authorization code issued by the GIS code client. */
export const POST = authedRoute(async (req, user) => {
  const { code } = await readJson(req, Body);
  const { refreshToken, email } = await exchangeDriveCode(code);
  await saveConnection(user.id, encrypt(refreshToken), email);
  return ok();
});

/** Revokes Drive access and deletes everything ingested from it. */
export const DELETE = authedRoute(async (_req, user) => {
  const conn = await getConnection(user.id);
  if (conn) await revokeToken(decrypt(conn.refresh_token_enc));
  await deleteConnection(user.id);
  return ok();
});
