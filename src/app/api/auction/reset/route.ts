import { NextResponse } from "next/server";
import { resetAuction } from "@/lib/auction";
import { requireAuth } from "@/lib/api-auth";
import { writableDb } from "@/lib/auction-store";

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    resetAuction(writableDb());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "RESET", message: e instanceof Error ? e.message : "Errore" }, { status: 409 });
  }
}
