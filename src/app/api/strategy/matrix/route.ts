import { matrix } from "@/lib/api-strategy";
export async function GET(req: Request) { return matrix(req); }
