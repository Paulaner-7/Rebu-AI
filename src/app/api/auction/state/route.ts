import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { publicState, writableDb } from "@/lib/auction-store";
import { cachedDb } from "@/lib/pgdb";

export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await publicState(cachedDb(writableDb()))) });
}
