import { NextResponse } from "next/server";
import { listModels, DEFAULT_MODEL } from "@/lib/agent";
import { requireAuth } from "@/lib/api-auth";
import { writableDb } from "@/lib/auction-store";

export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const db = writableDb();
  const saved = (db.prepare("SELECT value FROM settings WHERE key='modello_default'").get() as { value: string } | undefined)?.value ?? DEFAULT_MODEL;
  return NextResponse.json({ ok: true, data: { models: await listModels(), default: saved, configured: (process.env.OPENCODE_API_KEY ?? "").length > 0 } });
}

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { model?: string };
  if (!body.model) return NextResponse.json({ ok: false }, { status: 400 });
  writableDb().prepare("INSERT INTO settings (key,value) VALUES ('modello_default',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(body.model);
  return NextResponse.json({ ok: true });
}
