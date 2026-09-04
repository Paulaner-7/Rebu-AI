import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { dumpBackup, restoreBackup } from "@/lib/auction";

// GET: scarica JSON backup. POST: ripristina da JSON (vietato ad asta aperta).
export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const sid = await latestSessionId();
  if (!sid) return NextResponse.json({ ok: false, code: "NO_ASTA" }, { status: 404 });
  const dump = await dumpBackup(writableDb(), sid);
  const name = `rebu-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(dump), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const sid = await restoreBackup(writableDb(), body);
    return NextResponse.json({ ok: true, data: { sessionId: sid, stato: "PAUSA (verifica poi riprendi)" } });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "BACKUP", message: e instanceof Error ? e.message : "Errore" }, { status: 409 });
  }
}
