import { NextResponse } from "next/server";
import { publicState } from "@/lib/auction-store";

export async function GET() {
  return NextResponse.json({ ok: true, ...publicState() });
}
