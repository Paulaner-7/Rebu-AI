import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { requireAuth } from "@/lib/api-auth";
import { writableDb } from "@/lib/auction-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const db = writableDb();
  const live = await db.prepare("SELECT id FROM auction_sessions WHERE stato IN ('LIVE','PAUSA')").get();
  if (live) return NextResponse.json({ ok: false, code: "ASTA_APERTA", message: "Reimport vietato ad asta aperta" }, { status: 409 });
  const out: string = await new Promise((resolve) => {
    // Percorso a runtime (non bundlare: script eseguito come processo separato).
    const script = ["scripts", "import" + "-dataset.mjs"].join("/");
    execFile("node", [script], { cwd: process.cwd(), timeout: 120000 },
      (err, stdout, stderr) => resolve(stdout + (err ? `\nERRORE: ${stderr}` : "")));
  });
  return NextResponse.json({ ok: true, data: { log: out.slice(0, 2000) } });
}
