import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { getState } from "@/lib/auction";
import { rebuPayload } from "@/lib/rebu";

export const dynamic = "force-dynamic";

// GET /api/rebu/analyze?sessionId=&managerId=&officialId=
// managerId default = owner; officialId default = chiamato live.
export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? (await latestSessionId()) ?? 0);
  if (!sid) return NextResponse.json({ ok: false, code: "NESSUNA_ASTA" }, { status: 400 });
  try {
    const db = writableDb();
    const st = await getState(db, sid);
    const owner = st.managers.find((m) => m.is_owner === 1) ?? st.managers[0];
    const managerId = Number(u.searchParams.get("managerId") ?? owner?.id ?? 0);
    const officialId = Number(u.searchParams.get("officialId") ?? st.nomination?.o ?? 0);
    if (!managerId || !officialId) {
      return NextResponse.json({ ok: false, code: "NESSUNA_NOMINA" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, data: await rebuPayload(db, sid, managerId, officialId) });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "REBU", errore: e instanceof Error ? e.message : "errore" }, { status: 500 });
  }
}
