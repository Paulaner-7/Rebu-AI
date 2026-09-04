import { NextResponse } from "next/server";
import { writableDb } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { getState } from "@/lib/auction";
import { rimanentiRuolo } from "@/lib/pricing";

export const runtime = "nodejs";

// Rimanenti di un ruolo dopo chiamata: ranking + stats + rif/tetto owner.
export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? 0);
  const ruolo = (u.searchParams.get("ruolo") ?? "").toUpperCase();
  if (!sid || !["P", "D", "C", "A"].includes(ruolo)) {
    return NextResponse.json({ ok: false, code: "PARAM", message: "sessionId e ruolo P/D/C/A obbligatori" }, { status: 400 });
  }
  const st = await getState(writableDb(), sid);
  if (!st) return NextResponse.json({ ok: false, code: "ASTA" }, { status: 404 });
  const owner = st.managers.find((m) => m.is_owner === 1) ?? st.managers[0];
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 30), 1), 60);
  return NextResponse.json({
    ok: true,
    data: await rimanentiRuolo(writableDb(), sid, owner.id, ruolo, limit),
  });
}
