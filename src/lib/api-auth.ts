import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Gate per API protette (tutte tranne login/logout/health). Ritorna errore o null.
export async function requireAuth(req: Request): Promise<string | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
  if (await verifySession(token)) return null;
  return "non autenticato";
}
