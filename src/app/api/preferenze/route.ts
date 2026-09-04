import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { setPreferenza, getState } from "@/lib/auction";

export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const db = writableDb();
  const sid = await latestSessionId();
  const ds = sid ? (await getState(db, sid)).session.dataset : null;
  const rows = ds ? await db.prepare("SELECT official_id AS o, tipo FROM preferenze WHERE dataset_version=?").all(ds) : [];
  return NextResponse.json({ ok: true, data: rows });
}

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { officialId?: number; tipo?: "W" | "X" | null };
    const db = writableDb();
    const sid = await latestSessionId();
    if (!sid) return NextResponse.json({ ok: false, code: "NO_ASTA" }, { status: 409 });
    const ds = (await getState(db, sid)).session.dataset;
    if (!body.officialId) return NextResponse.json({ ok: false }, { status: 400 });
    await setPreferenza(db, ds, Number(body.officialId), body.tipo ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "?" }, { status: 500 });
  }
}
