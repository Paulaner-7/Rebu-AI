import { NextResponse } from "next/server";
import { writableDb } from "@/lib/auction-store";
import { requireAuth } from "@/lib/api-auth";
import { syncStats } from "@/lib/sync-stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// POST manuale (admin loggato): { seasons?, source? } — default 2026-27, all.
// GET cron Vercel (martedi 07:00): Bearer CRON_SECRET, sync 2026-27.
export async function POST(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({})) as { seasons?: string[]; source?: "all" | "understat" | "fantacalcio" };
    const rep = await syncStats(writableDb(), { seasons: body.seasons, source: body.source });
    return NextResponse.json({ ok: true, data: rep });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "SYNC", errore: e instanceof Error ? e.message : "errore" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || got !== secret) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  try {
    const rep = await syncStats(writableDb(), { seasons: ["2026-27"], source: "all" });
    return NextResponse.json({ ok: true, data: rep });
  } catch (e) {
    return NextResponse.json({ ok: false, code: "SYNC", errore: e instanceof Error ? e.message : "errore" }, { status: 500 });
  }
}
