import { control } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction((db, body) => {
    const b = body as { sessionId?: number; action?: "pause" | "resume" | "complete"; expected?: number };
    if (!b.action) throw new Error("action mancante");
    return control(db, Number(b.sessionId), b.action, b.expected);
  }, req);
}
