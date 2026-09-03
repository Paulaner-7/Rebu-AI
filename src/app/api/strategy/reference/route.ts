import { ref } from "@/lib/api-strategy";
export async function GET(req: Request) { return ref(req); }
