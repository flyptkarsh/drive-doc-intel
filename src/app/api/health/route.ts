import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const sql = await db();
  await sql`select 1`;
  return NextResponse.json({ ok: true });
}
