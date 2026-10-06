import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

// Starts a sync in the background; the dashboard polls /api/status for progress.
export const POST = handler(async () => {
  const user = await requireUser();
  void syncUser(user.id).catch(() => {});
  return NextResponse.json({ ok: true });
});
