import { NextResponse } from "next/server";
import { AuctionError } from "@/lib/auction";
import { writableDb } from "@/lib/auction-store";
import type { DatabaseSync } from "node:sqlite";

export async function runAuction<T>(fn: (db: DatabaseSync, body: Record<string, never>) => T, req: Request) {
  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, never>;
    const out = fn(writableDb(), body);
    return NextResponse.json({ ok: true, data: out });
  } catch (e) {
    if (e instanceof AuctionError) {
      return NextResponse.json({ ok: false, code: e.code, message: e.message }, { status: e.status });
    }
    throw e;
  }
}
