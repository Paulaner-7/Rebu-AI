// One-shot: applica migrazioni SQL a Supabase via connessione diretta.
// Password da env PGPASSWORD (mai in file). Uso:
//   PGPASSWORD=... node scripts/supabase-apply-sql.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REF = "rmndgqhfrrkwmzmrvfxd";
const HOSTS = [
  `db.${REF}.supabase.co:5432:postgres`,
  `aws-0-eu-west-1.pooler.supabase.com:6543:postgres.${REF}`,
  `aws-0-eu-central-1.pooler.supabase.com:6543:postgres.${REF}`,
];
let client = null;
let lastErr = null;
for (const h of HOSTS) {
  const [host, port, user] = h.split(":");
  const c = new pg.Client({
    host, port: Number(port), database: "postgres",
    user, password: process.env.PGPASSWORD ?? "",
    ssl: { rejectUnauthorized: false },
  });
  try { await c.connect(); client = c; console.log("connesso via", host); break; }
  catch (e) { lastErr = e; console.log("ko", host, e.code ?? e.message); }
}
if (!client) throw lastErr;
for (const f of ["0001_rebu_schema.sql", "0002_nomina_corrente.sql", "0003_preferenze.sql"]) {
  const sql = readFileSync(join(ROOT, "supabase", "migrations", f), "utf8");
  await client.query(sql);
  console.log("applicata", f);
}
const t = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1");
console.log("tabelle:", t.rows.map((r) => r.tablename).join(","));
await client.end();
