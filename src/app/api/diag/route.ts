import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

async function step(name: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  try {
    const v = await fn();
    const ms = Date.now() - t0;
    const summary = typeof v === "number" ? v : Array.isArray(v) ? `array(${v.length})` : typeof v;
    return { name, ms, ok: true, summary };
  } catch (e) {
    return { name, ms: Date.now() - t0, ok: false, err: e instanceof Error ? e.message.slice(0, 160) : "?" };
  }
}

// Diagnosi lentezza prod: tempi reali di ogni accesso dati.
export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  const only = new URL(req.url).searchParams.get("only") ?? "all";
  const { getSupabaseServer } = await import("@/lib/db");
  const sb = getSupabaseServer();
  const out: unknown[] = [];
  out.push(await step("supabase.settings", async () => {
    const { data } = await sb!.from("settings").select("value").eq("key", "dataset_attivo").maybeSingle();
    return (data?.value as string) ?? null;
  }));
  out.push(await step("supabase.players533", async () => {
    const { data, error } = await sb!.from("players").select("official_id,nome").eq("dataset_version", "v1-2026-09-03");
    if (error) throw new Error(error.message);
    return data?.length ?? -1;
  }));
  if (only === "sb") return NextResponse.json({ ok: true, steps: out });
  const { writableDb, latestSessionId } = await import("@/lib/auction-store");
  out.push(await step("pg.kind", async () => writableDb().kind));
  out.push(await step("pg.latestSessionId", () => latestSessionId()));
  out.push(await step("pg.getState", async () => {
    const { getState } = await import("@/lib/auction");
    const sid = await latestSessionId();
    if (!sid) return "no-sid";
    const st = await getState(writableDb(), sid);
    return st.acquisti;
  }));
  return NextResponse.json({ ok: true, steps: out });
}
