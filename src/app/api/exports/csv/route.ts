import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { buildExportInput, generateLegheFantacalcioCsv, knownIds, buildLegheExportFilename } from "@/lib/export";

export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? latestSessionId() ?? 0);
  if (!sid) return NextResponse.json({ ok: false, code: "NO_ASTA" }, { status: 404 });
  const db = writableDb();
  const s = db.prepare("SELECT dataset_version AS d, stato FROM auction_sessions WHERE id=?").get(sid) as { d: string; stato: string };
  if (s.stato !== "CONCLUSA") {
    const n = (db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE session_id=?").get(sid) as { n: number }).n;
    return NextResponse.json({ ok: false, code: "NON_CONCLUSA", message: `Asta in ${s.stato} con ${n} acquisti: export solo a rose complete` }, { status: 409 });
  }
  try {
    const input = buildExportInput(db, sid, u.searchParams.get("league") ?? "Rebu AI");
    const csv = generateLegheFantacalcioCsv(input, knownIds(db, s.d));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildLegheExportFilename(input.league.name, new Date())}"`,
      },
    });
  } catch (e) {
    const errs = (e as { errs?: unknown }).errs;
    return NextResponse.json({ ok: false, code: "VALIDAZIONE", message: e instanceof Error ? e.message : "Errore", errs }, { status: 422 });
  }
}
