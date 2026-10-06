import { NextResponse } from "next/server";
import { Unauthorized } from "./session";

/** Wraps a route handler so auth failures and thrown errors become JSON responses. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof Unauthorized) {
        return NextResponse.json({ error: "Not signed in" }, { status: 401 });
      }
      console.error(err);
      const message = err instanceof Error ? err.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
