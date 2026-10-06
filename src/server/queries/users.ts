import "server-only";
import type { User } from "@/lib/types";
import { db } from "../db";

export async function findUserById(id: string): Promise<User | null> {
  const sql = await db();
  const [user] = await sql<User[]>`
    select id, email, name, picture from users where id = ${id}`;
  return user ?? null;
}

export async function upsertGoogleUser(profile: {
  sub: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}): Promise<string> {
  const sql = await db();
  const [user] = await sql<{ id: string }[]>`
    insert into users (google_sub, email, name, picture)
    values (${profile.sub}, ${profile.email}, ${profile.name ?? null}, ${profile.picture ?? null})
    on conflict (google_sub) do update
      set email = excluded.email, name = excluded.name, picture = excluded.picture
    returning id`;
  return user.id;
}
