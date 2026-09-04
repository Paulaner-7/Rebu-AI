import { NextResponse } from "next/server";
import { AuctionError } from "@/lib/auction";
import { requireAuth } from "@/lib/api-auth";
import { writableDb } from "@/lib/auction-store";
import type { Db } from "@/lib/pgdb";

export async function runAuction<T>(fn: (db: Db, body: Record<string, never>) => Promise<T>, req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH", message: "non autenticato" }, { status: 401 });
  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, never>;
    const out = await fn(writableDb(), body);
    return NextResponse.json({ ok: true, data: out });
  } catch (e) {
    if (e instanceof AuctionError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }
}
