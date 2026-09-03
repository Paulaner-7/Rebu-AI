import { ceil } from "@/lib/api-strategy";
export async function GET(req: Request) { return ceil(req); }
