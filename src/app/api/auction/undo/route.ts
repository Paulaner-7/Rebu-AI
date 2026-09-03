import { undoLast } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction((db, body) => {
    const b = body as { sessionId?: number; expected?: number };
    return undoLast(db, Number(b.sessionId), b.expected);
  }, req);
}
