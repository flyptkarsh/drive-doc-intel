import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { db } from "./db";

const COOKIE = "ddi_session";
const MAX_AGE = 60 * 60 * 24 * 30;

export type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

function secret() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const sql = await db();
    const [user] = await sql<User[]>`
      select id, email, name, picture from users where id = ${payload.sub}`;
    return user ?? null;
  } catch {
    return null;
  }
}

export class Unauthorized extends Error {}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new Unauthorized();
  return user;
}
