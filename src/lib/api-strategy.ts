import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { getState } from "@/lib/auction";
import { prezzoRiferimento, tettoConsigliato, inflazioneAsta, prossimeChiamate, matriceLega } from "@/lib/pricing";

export async function authed(req: Request): Promise<NextResponse | null> {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  return null;
}

async function ctx(req: Request) {
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? (await latestSessionId()) ?? 0);
  if (!sid) throw new Error("Nessuna asta");
  const db = writableDb();
  const st = await getState(db, sid);
  return { db, sid, st, u };
}

export async function ref(req: Request) {
  const g = await authed(req);
  if (g) return g;
  const { db, st, u } = await ctx(req);
  return NextResponse.json({ ok: true, data: await prezzoRiferimento(db, st.session.dataset, Number(u.searchParams.get("officialId"))) });
}
export async function ceil(req: Request) {
  const g = await authed(req);
  if (g) return g;
  const { db, sid, u } = await ctx(req);
  return NextResponse.json({ ok: true, data: await tettoConsigliato(db, sid, Number(u.searchParams.get("managerId")), Number(u.searchParams.get("officialId"))) });
}
export async function infl(req: Request) {
  const g = await authed(req);
  if (g) return g;
  const { db, sid } = await ctx(req);
  return NextResponse.json({ ok: true, data: await inflazioneAsta(db, sid) });
}
export async function next(req: Request) {
  const g = await authed(req);
  if (g) return g;
  const { db, sid, u } = await ctx(req);
  return NextResponse.json({ ok: true, data: await prossimeChiamate(db, sid, Number(u.searchParams.get("managerId")), Number(u.searchParams.get("top") ?? 5)) });
}
export async function matrix(req: Request) {
  const g = await authed(req);
  if (g) return g;
  const { db, sid } = await ctx(req);
  return NextResponse.json({ ok: true, data: await matriceLega(db, sid) });
}
