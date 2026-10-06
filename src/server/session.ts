import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "@/lib/types";
import { env } from "./env";
import { findUserById } from "./queries/users";

const COOKIE = "ddi_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** The signed-in user, or null for a missing, invalid or expired session. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let userId: string | undefined;
  try {
    userId = (await jwtVerify(token, secret())).payload.sub;
  } catch {
    return null;
  }
  return userId ? findUserById(userId) : null;
}
