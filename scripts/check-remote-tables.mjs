// Check tabelle remote via REST (chiavi già in env dal wrapper). Non stampa valori.
const URL = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL || !KEY) {
  console.log("CHECK: chiavi assenti.");
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
for (const t of ["player_stats", "strategy_notes"]) {
  try {
    const r = await fetch(`${URL}/rest/v1/${t}?select=id&limit=1`, { headers: H });
    const body = await r.text();
    console.log(`CHECK ${t}: HTTP ${r.status} ${r.ok ? "OK" : body.slice(0, 120)}`);
  } catch (e) {
    console.log(`CHECK ${t}: errore rete ${e.message}`);
  }
}
