import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { publicState } from "@/lib/auction-store";

export async function GET(req: Request) {
  if (await requireAuth(req)) return NextResponse.json({ ok: false, code: "AUTH" }, { status: 401 });
  return NextResponse.json({ ok: true, ...publicState() });
}
