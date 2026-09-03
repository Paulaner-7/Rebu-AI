import { NextResponse } from "next/server";
import { getDbStatus } from "@/lib/db";
import { getEnvChecklist } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "Rebu AI",
    phase: 1,
    db: getDbStatus(),
    env: getEnvChecklist(),
  });
}
