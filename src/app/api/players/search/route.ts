import { NextResponse } from "next/server";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { getState } from "@/lib/auction";
import { searchAvailable } from "@/lib/catalog";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sid = Number(u.searchParams.get("sessionId") ?? latestSessionId() ?? 0);
  if (!sid) return NextResponse.json({ ok: true, data: [] });
  const st = getState(writableDb(), sid);
  if (!st || st.session.stato === "CONCLUSA") return NextResponse.json({ ok: true, data: [] });
  return NextResponse.json({
    ok: true,
    data: searchAvailable(
      writableDb(), sid, st.session.dataset,
      u.searchParams.get("q") ?? "", u.searchParams.get("ruolo") ?? "", u.searchParams.get("squadra") ?? ""
    ),
  });
}
