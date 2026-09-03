// Import idempotente dati/ -> SQLite locale (.data/rebu.db).
// Uso: npm run import
// Join listone<->guida su nome normalizzato + squadra. Storiche su Id ufficiale,
// fallback nome+squadra. PMA assente nei PDF 26/27 -> colonna NULL + nota report.
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import XLSX from "xlsx";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATI = join(ROOT, "..", "dati");
const DB_PATH = join(ROOT, ".data", "rebu.db");

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’‘`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function sheetRows(path, name, headerRow) {
  const wb = XLSX.readFile(path, { type: "file" });
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Foglio ${name} mancante in ${path}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const header = rows[headerRow].map((h) => String(h ?? "").trim());
  return rows.slice(headerRow + 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const files = {
  listone: join(DATI, "listone.xlsx"),
  guida: join(DATI, "guida_asta.xlsx"),
  storiche: {
    qt_2223: join(DATI, "quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2022_23.xlsx"),
    qt_2324: join(DATI, "quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2023_24.xlsx"),
    qt_2425: join(DATI, "quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2024_25.xlsx"),
    qt_2526: join(DATI, "quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2025_26.xlsx"),
  },
};
for (const p of [files.listone, files.guida, ...Object.values(files.storiche)]) {
  if (!existsSync(p)) throw new Error(`File mancante: ${p}`);
}
const hash = createHash("sha256");
for (const p of [files.listone, files.guida, ...Object.values(files.storiche)]) hash.update(readFileSync(p));
const sourceHash = hash.digest("hex").slice(0, 16);

mkdirSync(join(ROOT, ".data"), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(join(ROOT, "src", "lib", "schema.sqlite.sql"), "utf8"));

const same = db.prepare("SELECT version FROM dataset_versions WHERE source_hash = ?").get(sourceHash);
if (same) {
  console.log(`IDEMPOTENTE: hash ${sourceHash} già importato come ${same.version}. Niente duplicati.`);
  process.exit(0);
}

// --- Listone ---
const tutti = sheetRows(files.listone, "Tutti", 1).filter((r) => r.Id != null);
const ceduti = sheetRows(files.listone, "Ceduti", 1).filter((r) => r.Id != null);

// --- Guida ---
const squadre = sheetRows(files.guida, "Squadre", 0);
const titolari = sheetRows(files.guida, "Titolari", 0).filter((r) => r.Giocatore);
const ballottaggi = sheetRows(files.guida, "Ballottaggi", 0).filter((r) => r.Giocatore1);
const piazzati = sheetRows(files.guida, "Piazzati", 0).filter((r) => r.Giocatore);
const grigliaRaw = sheetRows(files.guida, "Griglia_Portieri", 0);

// --- Storiche: mappa Id -> Qt.A e norm+squadra -> Qt.A ---
const histById = {}, histByName = {};
for (const [col, path] of Object.entries(files.storiche)) {
  histById[col] = new Map(); histByName[col] = new Map();
  for (const r of sheetRows(path, "Tutti", 1)) {
    if (r.Id == null) continue;
    histById[col].set(Number(r.Id), r["Qt.A"] ?? null);
    histByName[col].set(`${norm(r.Nome)}|${norm(r.Squadra)}`, r["Qt.A"] ?? null);
  }
}

// --- Lookup guida ---
const titSet = new Set(titolari.map((r) => `${norm(r.Giocatore)}|${norm(r.Squadra)}`));
const balMap = new Map(); // giocatore -> "con X"
for (const b of ballottaggi) {
  balMap.set(`${norm(b.Giocatore1)}|${norm(b.Squadra)}`, `con ${b.Giocatore2}`);
  if (b.Giocatore2) balMap.set(`${norm(b.Giocatore2)}|${norm(b.Squadra)}`, `con ${b.Giocatore1}`);
}
const piaMap = new Map(); // giocatore -> {rig, pun}
for (const p of piazzati) {
  const k = `${norm(p.Giocatore)}|${norm(p.Squadra)}`;
  if (!piaMap.has(k)) piaMap.set(k, {});
  piaMap.get(k)[p.Tipo === "Rigori" ? "rig" : "pun"] = p.Ordine;
}

const version = `v1-${new Date().toISOString().slice(0, 10)}`;
const counts = { P: 0, D: 0, C: 0, A: 0 };
let onlyListone = 0, titNoMatch = 0, histHit = 0;
const onlyListoneNames = [];

const insPlayer = db.prepare(`INSERT INTO players
  (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra,
   qt_a, qt_i, fvm, is_titolare, ballottaggio, rigorista_ord, punizioni_ord, pma,
   qt_2223, qt_2324, qt_2425, qt_2526)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

db.exec("BEGIN");
try {
  db.prepare("INSERT INTO dataset_versions (version, source_hash, counts, report) VALUES (?,?,?,?)")
    .run(version, sourceHash, "{}", "{}");
  const insSquad = db.prepare("INSERT INTO squads (dataset_version, squadra, sigla, modulo, allenatore) VALUES (?,?,?,?,?)");
  for (const s of squadre) insSquad.run(version, s.Squadra, s.Sigla, s.Modulo, s.Allenatore);

  for (const r of tutti) {
    const key = `${norm(r.Nome)}|${norm(r.Squadra)}`;
    const isTit = titSet.has(key) ? 1 : 0;
    if (!isTit) { onlyListone++; if (onlyListoneNames.length < 10) onlyListoneNames.push(`${r.Nome} (${r.Squadra})`); }
    counts[r.R] = (counts[r.R] ?? 0) + 1;
    const q = {};
    for (const col of Object.keys(files.storiche)) {
      let v = histById[col].get(Number(r.Id));
      if (v == null) v = histByName[col].get(key) ?? null;
      if (v != null) histHit++;
      q[col] = v;
    }
    const pia = piaMap.get(key) ?? {};
    insPlayer.run(version, Number(r.Id), r.Nome, norm(r.Nome), r.Squadra, r.R, r.RM ?? "",
      r["Qt.A"] ?? null, r["Qt.I"] ?? null, r.FVM ?? null, isTit,
      balMap.get(key) ?? "", pia.rig ?? null, pia.pun ?? null, null,
      q.qt_2223, q.qt_2324, q.qt_2425, q.qt_2526);
  }
  // titolari guida senza match listone (atteso 0)
  for (const t of titolari) {
    const ok = tutti.some((r) => norm(r.Nome) === norm(t.Giocatore) && norm(r.Squadra) === norm(t.Squadra));
    if (!ok) titNoMatch++;
  }
  const insB = db.prepare("INSERT INTO ballottaggi (dataset_version, squadra, giocatore1, giocatore2) VALUES (?,?,?,?)");
  for (const b of ballottaggi) insB.run(version, b.Squadra, b.Giocatore1, b.Giocatore2 || "");
  const insP = db.prepare("INSERT INTO piazzati (dataset_version, squadra, tipo, ordine, giocatore) VALUES (?,?,?,?,?)");
  for (const p of piazzati) insP.run(version, p.Squadra, p.Tipo, p.Ordine, p.Giocatore);
  const insG = db.prepare("INSERT INTO griglia_portieri (dataset_version, s1, s2, valore) VALUES (?,?,?,?)");
  let gridN = 0;
  for (const row of grigliaRaw) {
    const s1 = row["\\"];
    if (!s1 || s1 === "Nota" || s1 === "Sigle") continue;
    for (const [k, v] of Object.entries(row)) {
      if (k === "\\" || v == null || v === "") continue;
      insG.run(version, s1, k, Number(v)); gridN++;
    }
  }
  const set = db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo",version]]) set.run(k, v);

  const report = {
    giocatori_totali: tutti.length, per_ruolo: counts, ceduti_esclusi: ceduti.length,
    solo_listone_non_titolari: onlyListone, titolari_senza_match: titNoMatch,
    quotazioni_storiche_match: histHit, griglia_celle: gridN,
    pma: "ASSENTE nei PDF 26/27: colonna NULL su tutti. Prezzi = FVM/2 + storiche.",
    esempi_solo_listone: onlyListoneNames,
  };
  db.prepare("UPDATE dataset_versions SET counts=?, report=? WHERE version=?")
    .run(JSON.stringify({ ...counts, totale: tutti.length }), JSON.stringify(report), version);
  db.exec("COMMIT");
  console.log(`IMPORT OK ${version} hash=${sourceHash}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
