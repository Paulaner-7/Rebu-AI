// Env server-only. Importare solo in route/middleware/componenti server.
// MAI importare chiavi in client components.

export function getServerEnv() {
  const env = {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    opencodeKey: process.env.OPENCODE_API_KEY ?? "",
    accessCode: process.env.REBU_ACCESS_CODE ?? "",
    sessionSecret: process.env.REBU_SESSION_SECRET ?? "",
  };
  return env;
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseServiceKey } = getServerEnv();
  return supabaseUrl.length > 0 && supabaseServiceKey.length > 0;
}

export function getEnvChecklist() {
  const e = getServerEnv();
  return [
    { key: "SUPABASE_URL", ok: e.supabaseUrl.length > 0, neededFrom: "Fase 8 (deploy)" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", ok: e.supabaseServiceKey.length > 0, neededFrom: "Fase 8 (deploy)" },
    { key: "OPENCODE_API_KEY", ok: e.opencodeKey.length > 0, neededFrom: "Fase 5 (chat AI)" },
    { key: "REBU_ACCESS_CODE", ok: e.accessCode.length >= 8, neededFrom: "ora (login)" },
  ];
}
