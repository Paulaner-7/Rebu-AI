import { nominate } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction((db, body) => {
    const b = body as { sessionId?: number; officialId?: number; expected?: number };
    return nominate(db, Number(b.sessionId), Number(b.officialId), b.expected);
  }, req);
}
