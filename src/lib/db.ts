import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { getServerEnv, isSupabaseConfigured } from "./env";
import { DATASET_META } from "./dataset-meta";

export type DbProvider = "supabase" | "local-mock";

let cached: SupabaseClient | null = null;

export function getDbProvider(): DbProvider {
  return isSupabaseConfigured() ? "supabase" : "local-mock";
}

// Solo server. Service key MAI al browser.
export function getSupabaseServer(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;
  const { supabaseUrl, supabaseServiceKey } = getServerEnv();
  const fetchWithTimeout: typeof fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
  cached = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  });
  return cached;
}

export function getDbStatus() {
  const provider = getDbProvider();
  return {
    provider,
    supabaseConfigured: provider === "supabase",
    // Fase 8: ping reale a Supabase. Ora: mock locale = dati già verificati.
    dataset: DATASET_META,
    note:
      provider === "supabase"
        ? "Supabase configurato."
        : "Database auto da cartella dati/ a ogni apertura. Nessun import manuale.",
  };
}
