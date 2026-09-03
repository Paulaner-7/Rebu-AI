import { setupLeague, type ManagerInput } from "@/lib/auction";
import { runAuction } from "@/lib/api-auction";

export async function POST(req: Request) {
  return runAuction((db, body) => {
    const managers = (body as { managers?: ManagerInput[] }).managers;
    if (!managers) throw new Error("managers mancanti");
    return { sessionId: setupLeague(db, managers) };
  }, req);
}
