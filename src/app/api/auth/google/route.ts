import { z } from "zod";
import { env, isSignInAllowed } from "@/server/env";
import { verifyIdToken } from "@/server/google";
import { HttpError, ok, readJson, route } from "@/server/http";
import { upsertGoogleUser } from "@/server/queries/users";
import { createSession } from "@/server/session";

const Body = z.object({ credential: z.string().min(1) });

/** Exchanges a Google One Tap / Sign in with Google credential for a session. */
export const POST = route(async (req) => {
  const { credential } = await readJson(req, Body);
  const profile = await verifyIdToken(credential);
  if (!isSignInAllowed(profile.email, env.allowedSignIns)) {
    throw new HttpError(403, "This Google account isn't allowed to sign in.");
  }
  await createSession(await upsertGoogleUser(profile));
  return ok();
});
