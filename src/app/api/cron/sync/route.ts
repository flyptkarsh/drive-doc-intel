import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncAll } from "@/lib/sync";

// For an external scheduler (e.g. a Render cron job): wakes the service and syncs everyone.
export async function POST(req: Request) {
  const secret = env.cronSecret;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  void syncAll();
  return NextResponse.json({ ok: true });
}
