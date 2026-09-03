import { NextResponse } from "next/server";
import { runChat } from "@/lib/agent";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as { domanda?: string; model?: string };
    if (!body.domanda?.trim()) return NextResponse.json({ ok: false, code: "DOMANDA", message: "Domanda vuota" }, { status: 400 });
    return NextResponse.json({ ok: true, data: await runChat(body.domanda.trim(), body.model) });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "AGENTE", message: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
