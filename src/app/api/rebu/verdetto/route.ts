import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { getState } from "@/lib/auction";
import { analisiRebu } from "@/lib/rebu";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/rebu/verdetto { sessionId?, managerId?, officialId?, forza? }
// forza=true: AI anche su nomination irrilevante (on-demand da badge).
export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: number; managerId?: number; officialId?: number; forza?: boolean };
    const sid = Number(body.sessionId ?? (await latestSessionId()) ?? 0);
    if (!sid) return NextResponse.json({ ok: false, code: "NESSUNA_ASTA" }, { status: 400 });
    const db = writableDb();
    const st = await getState(db, sid);
    const owner = st.managers.find((m) => m.is_owner === 1) ?? st.managers[0];
    const managerId = Number(body.managerId ?? owner?.id ?? 0);
    const officialId = Number(body.officialId ?? st.nomination?.o ?? 0);
    if (!managerId || !officialId) {
      return NextResponse.json({ ok: false, code: "NESSUNA_NOMINA" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, data: await analisiRebu(db, sid, managerId, officialId, { forza: body.forza === true }) });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "REBU", errore: e instanceof Error ? e.message : "errore" }, { status: 500 });
  }
}
