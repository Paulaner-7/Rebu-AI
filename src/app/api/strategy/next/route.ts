import { next } from "@/lib/api-strategy";
export async function GET(req: Request) { return next(req); }
