import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { db } from "@/lib/db";
import { isSignInAllowed } from "@/lib/env";
import { verifyIdToken } from "@/lib/google";
import { createSession } from "@/lib/session";

// Receives the ID token credential from Google One Tap / the Sign in with Google button.
export const POST = handler(async (req: Request) => {
  const { credential } = (await req.json()) as { credential?: string };
  if (!credential) return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  const profile = await verifyIdToken(credential);
  if (!isSignInAllowed(profile.email!)) {
    return NextResponse.json({ error: "This Google account isn't allowed to sign in." }, { status: 403 });
  }
  const sql = await db();
  const [user] = await sql<{ id: string }[]>`
    insert into users (google_sub, email, name, picture)
    values (${profile.sub}, ${profile.email!}, ${profile.name ?? null}, ${profile.picture ?? null})
    on conflict (google_sub) do update set email = excluded.email, name = excluded.name, picture = excluded.picture
    returning id`;
  await createSession(user.id);
  return NextResponse.json({ ok: true });
});
