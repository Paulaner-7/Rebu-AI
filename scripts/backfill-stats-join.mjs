// One-shot: riempie official_id NULL in player_stats col matcher tollerante
// (stessa regola di trovaOfficialId in sync-stats.mjs / stessoGiocatore in
// src/lib/stats.ts). Non tocca hash idempotenza (hash copre solo payload fonti).
// Uso: node scripts/backfill-stats-join.mjs [--dry]
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const norm = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[.'’‘`]/g, "").replace(/\s+/g, " ").trim();

const db = new DatabaseSync(join(ROOT, ".data", "rebu.db"));
db.exec(readFileSync(join(ROOT, "src", "lib", "schema.sqlite.sql"), "utf8"));
const ds = db.prepare("SELECT value AS v FROM settings WHERE key='dataset_attivo'").get()?.v;
if (!ds) throw new Error("dataset_attivo assente");
const attivi = db.prepare("SELECT official_id, nome_norm, squadra FROM players WHERE dataset_version=?").all(ds);

function joinId(nomeNorm, squadra) {
  const rt = nomeNorm.split(" ").filter((t) => t.length > 1);
  const cogR = rt[rt.length - 1];
  if (!cogR) return null;
  const cand = attivi.filter((p) => {
    if (norm(p.squadra) !== norm(squadra)) return false;
    const pL = p.nome_norm.split(" ").filter((t) => t.length > 1);
    return pL.includes(cogR) && pL.every((t) => rt.includes(t));
  });
  let ids = [...new Set(cand.map((p) => p.official_id))];
  if (ids.length > 1) {
    const f = cand.filter((p) => p.nome_norm.split(" ").some((t) => t.startsWith(nomeNorm.charAt(0))));
    if (f.length) ids = [...new Set(f.map((p) => p.official_id))];
  }
  return ids.length === 1 ? ids[0] : null;
}

const rows = db.prepare("SELECT id, nome_norm, squadra, stagione, fonte FROM player_stats WHERE official_id IS NULL").all();
let agganciati = 0;
const upd = db.prepare("UPDATE player_stats SET official_id=?, updated_at=datetime('now') WHERE id=?");
if (!DRY) db.exec("BEGIN");
for (const r of rows) {
  const id = joinId(r.nome_norm, r.squadra);
  if (id != null) { agganciati++; if (!DRY) upd.run(id, r.id); }
}
if (!DRY) db.exec("COMMIT");
console.log(`${DRY ? "DRY " : ""}backfill: ${agganciati}/${rows.length} righe NULL agganciate (dataset ${ds}).`);
