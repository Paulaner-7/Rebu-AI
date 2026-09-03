import { NextResponse } from "next/server";
import { resetAuction } from "@/lib/auction";
import { writableDb } from "@/lib/auction-store";

export async function POST() {
  try {
    resetAuction(writableDb());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "RESET", message: e instanceof Error ? e.message : "Errore" }, { status: 409 });
  }
}
