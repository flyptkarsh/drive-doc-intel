import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { DRIVE_SCOPE, oauthClient } from "@/lib/google";
import { requireUser } from "@/lib/session";

// Exchanges an authorization code from the GIS code client for a refresh token.
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { code } = (await req.json()) as { code?: string };
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.scope?.split(" ").includes(DRIVE_SCOPE)) {
    return NextResponse.json({ error: "Google Drive access wasn't granted." }, { status: 400 });
  }
  if (!tokens.refresh_token) {
    return NextResponse.json(
      { error: "Google didn't return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again." },
      { status: 400 },
    );
  }
  let googleEmail: string | null = null;
  if (tokens.id_token) {
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token });
    googleEmail = ticket.getPayload()?.email ?? null;
  }
  const sql = await db();
  await sql`
    insert into drive_connections (user_id, refresh_token_enc, google_email)
    values (${user.id}, ${encrypt(tokens.refresh_token)}, ${googleEmail})
    on conflict (user_id) do update set refresh_token_enc = excluded.refresh_token_enc,
      google_email = excluded.google_email, last_sync_error = null`;
  return NextResponse.json({ ok: true });
});

export const DELETE = handler(async () => {
  const user = await requireUser();
  const sql = await db();
  await sql`delete from drive_connections where user_id = ${user.id}`;
  await sql`delete from documents where user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
});
