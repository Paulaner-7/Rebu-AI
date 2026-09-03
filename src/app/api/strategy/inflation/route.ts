import { infl } from "@/lib/api-strategy";
export async function GET(req: Request) { return infl(req); }
