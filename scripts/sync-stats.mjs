// Rebu AI — sync statistiche giocatori Serie A -> tabella player_stats (SQLite locale).
// Fonti gratuite, nessuna API key: Understat (xG/xA/...) + fantacalcio.it (MV/FM/gol/...).
// Uso:
//   node scripts/sync-stats.mjs                      # tutte le fonti, stagioni 2022-23..2026-27
//   node scripts/sync-stats.mjs --source understat --seasons 2025-26,2026-27
//   node scripts/sync-stats.mjs --dry                # niente scritture, solo report
// Idempotente: hash per (fonte, stagione) in settings; upsert su UNIQUE(stagione, fonte, nome_norm, squadra).
// In produzione il sync gira via route /api/dataset/sync-stats (cron Vercel + pulsante manuale):
// la logica di fetch/parse/join vive in stats-sources.mjs, condivisa con src/lib/sync-stats.ts.
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  sleep, fetchUnderstat, fetchFantacalcio, makeTrovaOfficialId, COLS,
} from "./stats-sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = join(ROOT, ".data", "rebu.db");
const STAGIONI_DEFAULT = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"];

// --- argomenti ---
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes("--dry");
const SOURCE = opt("source", "all"); // understat | fantacalcio | all
const SEASONS = opt("seasons", STAGIONI_DEFAULT.join(",")).split(",").map((s) => s.trim());

// ---------- main ----------
mkdirSync(join(ROOT, ".data"), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(join(ROOT, "src", "lib", "schema.sqlite.sql"), "utf8"));

const ds = (db.prepare("SELECT value AS v FROM settings WHERE key='dataset_attivo'").get() ?? { v: null }).v;
const attivi = ds ? db.prepare("SELECT official_id, nome, nome_norm, squadra FROM players WHERE dataset_version=?").all(ds) : [];
const trovaOfficialId = makeTrovaOfficialId(attivi);

const upsert = db.prepare(`INSERT INTO player_stats (${[...COLS, "updated_at"].join(",")})
  VALUES (${[...COLS, "updated_at"].map(() => "?").join(",")})
  ON CONFLICT(stagione, fonte, nome_norm, squadra) DO UPDATE SET
  ${COLS.filter((c) => !["stagione", "fonte", "nome_norm", "squadra"].includes(c)).map((c) => `${c}=excluded.${c}`).join(", ")},
  updated_at=excluded.updated_at`);

let totale = 0;
const fonti = SOURCE === "all" ? ["understat", "fantacalcio"] : [SOURCE];
const jobs = [];
for (const stagione of SEASONS) {
  for (const fonte of fonti) {
    try {
      const rows = fonte === "understat" ? await fetchUnderstat(stagione) : await fetchFantacalcio(stagione);
      jobs.push({ label: `${fonte} ${stagione}`, rows });
      console.log(`${fonte} ${stagione}: ${rows.length} giocatori`);
      await sleep(1500); // gentilezza verso le fonti gratuite
    } catch (e) {
      console.error(`SKIP ${fonte} ${stagione}: ${e.message}`);
    }
  }
}

const now = () => new Date().toISOString();
for (const job of jobs) {
  const hash = createHash("sha256").update(JSON.stringify(job.rows)).digest("hex").slice(0, 16);
  const key = `stats_hash_${job.label.replace(/\W+/g, "_")}`;
  const cur = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (cur?.value === hash) { console.log(`IDEMPOTENTE ${job.label}: invariato, skip.`); continue; }
  let joined = 0;
  const run = () => {
    const ts = now();
    for (const r0 of job.rows) {
      const r = { official_id: null, ...r0 };
      if (r.official_id == null) r.official_id = trovaOfficialId(r);
      if (r.official_id != null) joined++;
      upsert.run(...COLS.map((c) => r[c] ?? null), ts);
    }
  };
  if (DRY) { console.log(`DRY ${job.label}: ${job.rows.length} righe, join official_id stimato ${job.rows.filter((r) => trovaOfficialId(r)).length}`); continue; }
  db.exec("BEGIN");
  try {
    run();
    db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, hash);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  totale += job.rows.length;
  console.log(`OK ${job.label}: ${job.rows.length} righe, official_id agganciati ${joined}`);
}
console.log(`FINE. Righe scritte: ${totale}. Dataset attivo per join: ${ds ?? "nessuno"}.`);
