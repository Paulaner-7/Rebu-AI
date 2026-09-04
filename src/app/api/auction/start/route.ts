import { startAuction } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction(async (db, body) => {
    const b = body as { sessionId?: number; expected?: number };
    return { versione: await startAuction(db, Number(b.sessionId), b.expected) };
  }, req);
}
