import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { updateManagers, type ManagerInput } from "@/lib/auction";

export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const db = writableDb();
  const mans = await db.prepare("SELECT nome, nome_squadra, note FROM managers ORDER BY id").all();
  const mod = ((await db.prepare("SELECT value FROM settings WHERE key='modificatore_difesa'").get()) as { value: string } | undefined)?.value ?? "on";
  return NextResponse.json({ ok: true, data: { managers: mans, modificatore: mod } });
}

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { managers?: ManagerInput[]; modificatore?: string };
    const db = writableDb();
    if (body.modificatore === "on" || body.modificatore === "off") {
      await db.prepare("INSERT INTO settings (key,value) VALUES ('modificatore_difesa',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(body.modificatore);
    }
    if (body.managers) {
      const sid = await latestSessionId();
      if (!sid) return NextResponse.json({ ok: false, code: "NO_ASTA", message: "Prepara prima asta" }, { status: 409 });
      await updateManagers(db, sid, body.managers);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const c = (e as { code?: string; message?: string }).code ?? "ERRORE";
    return NextResponse.json({ ok: false, code: c, message: (e as Error).message }, { status: 409 });
  }
}
