// One-shot: SQLite locale -> Supabase (tabelle dati). L'app resta su SQLite
// finché non chiedi il passaggio runtime. Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-supabase.mjs [--dry]
import { DatabaseSync } from "node:sqlite";

const URL = process.env.SUPABASE_URL ?? "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const DRY = process.argv.includes("--dry");
if (!URL || !KEY) {
  console.log("Mancano SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Vedi DEPLOY.md. Niente fatto.");
  process.exit(2);
}
const db = new DatabaseSync("rebu-ai/.data/rebu.db", { readOnly: true });
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
async function push(table, rows, chunk = 400) {
  console.log(table, rows.length, "righe");
  if (DRY || !rows.length) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const r = await fetch(`${URL}/rest/v1/${table}`, {
      method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows.slice(i, i + chunk)),
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
  }
}
const all = (t) => db.prepare(`SELECT * FROM ${t}`).all();
const ds = db.prepare("SELECT value AS v FROM settings WHERE key='dataset_attivo'").get().v;
await push("dataset_versions", all("dataset_versions"));
await push("squads", all("squads"));
await push("players", all("players").map((p) => ({ ...p, is_titolare: !!p.is_titolare })));
await push("ballottaggi", all("ballottaggi"));
await push("piazzati", all("piazzati"));
await push("griglia_portieri", all("griglia_portieri"));
await push("preferenze", all("preferenze"));
await push("managers", all("managers").map((m) => ({ ...m, is_owner: !!m.is_owner })));
console.log("Migrazione dati OK, dataset", ds, DRY ? "(dry-run)" : "");
