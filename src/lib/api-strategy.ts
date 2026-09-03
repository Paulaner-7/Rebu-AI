import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { getState } from "@/lib/auction";
import { prezzoRiferimento, tettoConsigliato, inflazioneAsta, prossimeChiamate, matriceLega } from "@/lib/pricing";

function ctx(req: Request) {
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? latestSessionId() ?? 0);
  if (!sid) throw new Error("Nessuna asta");
  const db = writableDb();
  const st = getState(db, sid);
  return { db, sid, st, u };
}

export async function ref(req: Request) {
  const { db, st, u } = ctx(req);
  return NextResponse.json({ ok: true, data: prezzoRiferimento(db, st.session.dataset, Number(u.searchParams.get("officialId"))) });
}
export async function ceil(req: Request) {
  const { db, sid, u } = ctx(req);
  return NextResponse.json({ ok: true, data: tettoConsigliato(db, sid, Number(u.searchParams.get("managerId")), Number(u.searchParams.get("officialId"))) });
}
export async function infl(req: Request) {
  const { db, sid } = ctx(req);
  return NextResponse.json({ ok: true, data: inflazioneAsta(db, sid) });
}
export async function next(req: Request) {
  const { db, sid, u } = ctx(req);
  return NextResponse.json({ ok: true, data: prossimeChiamate(db, sid, Number(u.searchParams.get("managerId")), Number(u.searchParams.get("top") ?? 5)) });
}
export async function matrix(req: Request) {
  const { db, sid } = ctx(req);
  return NextResponse.json({ ok: true, data: matriceLega(db, sid) });
}
