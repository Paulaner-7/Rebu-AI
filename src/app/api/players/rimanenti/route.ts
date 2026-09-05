import { NextResponse } from "next/server";
import { writableDb } from "@/lib/auction-store";
import { cachedDb } from "@/lib/pgdb";
import { requireAuth } from "@/lib/api-auth";
import { ensureExtras } from "@/lib/auction";
import { rimanentiRuolo } from "@/lib/pricing";

export const runtime = "nodejs";
export const maxDuration = 60;

// Rimanenti di un ruolo dopo chiamata: ranking + stats + rif/tetto owner.
export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? 0);
  const ruolo = (u.searchParams.get("ruolo") ?? "").toUpperCase();
  if (!sid || !["P", "D", "C", "A"].includes(ruolo)) {
    return NextResponse.json({ ok: false, code: "PARAM", message: "sessionId e ruolo P/D/C/A obbligatori" }, { status: 400 });
  }
  const db = cachedDb(writableDb());
  await ensureExtras(db);
  const sess = await db.prepare("SELECT id FROM auction_sessions WHERE id=?").get(sid);
  if (!sess) return NextResponse.json({ ok: false, code: "ASTA" }, { status: 404 });
  const owner = (await db.prepare("SELECT id FROM managers ORDER BY is_owner DESC, id LIMIT 1").get()) as { id: number } | undefined;
  if (!owner) return NextResponse.json({ ok: false, code: "ASTA", message: "Squadre assenti" }, { status: 404 });
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit") ?? 30), 1), 60);
  return NextResponse.json({
    ok: true,
    data: await rimanentiRuolo(db, sid, owner.id, ruolo, limit),
  });
}
