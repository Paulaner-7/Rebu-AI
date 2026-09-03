import { sell } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction((db, body) => {
    const b = body as { sessionId?: number; officialId?: number; managerId?: number; prezzo?: number; idem?: string; expected?: number };
    return sell(db, Number(b.sessionId), {
      officialId: Number(b.officialId), managerId: Number(b.managerId),
      prezzo: Number(b.prezzo), idem: String(b.idem ?? ""), expected: b.expected,
    });
  }, req);
}
