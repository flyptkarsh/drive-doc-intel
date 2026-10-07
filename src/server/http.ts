import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@/lib/types";
import { currentUser } from "./session";

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const notFound = (message = "Not found") => new HttpError(404, message);

function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects state-changing requests sent by another site (CSRF). Browsers attach
 * an Origin header to every cross-site POST; requests without one (curl, the
 * cron caller) aren't browser-driven and are authorized by other means.
 */
function assertSameOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Cross-site request rejected.");
  }
  if (originHost !== host) throw new HttpError(403, "Cross-site request rejected.");
}

/** Wraps a public route handler with consistent error responses and CSRF protection. */
export function route<Ctx = unknown>(
  fn: (req: Request, ctx: Ctx) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Wraps a route handler that requires a signed-in user. */
export function authedRoute<Ctx = unknown>(
  fn: (req: Request, user: User, ctx: Ctx) => Promise<Response>,
): (req: Request, ctx: Ctx) => Promise<Response> {
  return route(async (req, ctx: Ctx) => {
    const user = await currentUser();
    if (!user) throw new HttpError(401, "Not signed in");
    return fn(req, user, ctx);
  });
}

/**
 * Parses and validates a JSON request body. Requiring the JSON content type also
 * means a plain cross-site HTML form can never produce a body this accepts.
 */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Request body must be sent as application/json");
  }
  const body = await req.json().catch(() => {
    throw badRequest("Request body must be JSON");
  });
  return schema.parse(body);
}

export const ok = (data: object = { ok: true }) => NextResponse.json(data);
