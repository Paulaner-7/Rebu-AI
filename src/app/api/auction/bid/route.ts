import { bid } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction((db, body) => {
    const b = body as { sessionId?: number; officialId?: number; prezzo?: number; expected?: number };
    return bid(db, Number(b.sessionId), {
      officialId: Number(b.officialId), prezzo: Number(b.prezzo), expected: b.expected,
    });
  }, req);
}
