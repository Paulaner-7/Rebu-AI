// Rebu AI — sync statistiche giocatori Serie A -> tabella player_stats (SQLite locale).
// Fonti gratuite, nessuna API key:
//   1) Understat  -> xG, xA, npxG, tiri, key passes, minuti (2014/15 -> stagione live)
//   2) fantacalcio.it/statistiche-serie-a -> PV, MV, FM, gol, assist, rigori, cartellini
// Uso:
//   node scripts/sync-stats.mjs                      # tutte le fonti, stagioni 2022-23..2026-27
//   node scripts/sync-stats.mjs --source understat --seasons 2025-26,2026-27
//   node scripts/sync-stats.mjs --dry                # niente scritture, solo report
//   node scripts/sync-stats.mjs --from-json dump.json  # import manuale (vedi formato in coda)
// Idempotente: hash per (fonte, stagione) in settings; upsert su UNIQUE(stagione, fonte, nome_norm, squadra).
// Pianificazione consigliata: 1 volta a settimana (es. martedì, a voti ufficiali pubblicati).
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = join(ROOT, ".data", "rebu.db");
const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) RebuAI/1.0 (stats sync settimanale)", "Accept-Language": "it-IT,it;q=0.9" };
const STAGIONI_DEFAULT = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"];

// --- argomenti ---
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes("--dry");
const SOURCE = opt("source", "all"); // understat | fantacalcio | all
const SEASONS = opt("seasons", STAGIONI_DEFAULT.join(",")).split(",").map((s) => s.trim());
const FROM_JSON = opt("from-json", "");

// --- stessa normalizzazione di scripts/import-dataset.mjs: NON modificare una sola ---
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’‘`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- mappe squadre -> nome usato dal listone fantacalcio.it ---
const TEAM_UNDERSTAT = {
  "ac milan": "milan", "parma calcio 1913": "parma", "hellas verona": "verona",
  inter: "inter", roma: "roma", napoli: "napoli", juventus: "juventus", lazio: "lazio",
  atalanta: "atalanta", fiorentina: "fiorentina", torino: "torino", bologna: "bologna",
  udinese: "udinese", genoa: "genoa", cagliari: "cagliari", como: "como", lecce: "lecce",
  pisa: "pisa", sassuolo: "sassuolo", cremonese: "cremonese", empoli: "empoli",
  venezia: "venezia", monza: "monza", salernitana: "salernitana", frosinone: "frosinone",
  spezia: "spezia", sampdoria: "sampdoria", benevento: "benevento", crotone: "crotone",
};
const SIGLA2SQUADRA = {
  ATA: "Atalanta", BOL: "Bologna", CAG: "Cagliari", COM: "Como", CRE: "Cremonese",
  EMP: "Empoli", FIO: "Fiorentina", FRO: "Frosinone", GEN: "Genoa", INT: "Inter",
  JUV: "Juventus", LAZ: "Lazio", LEC: "Lecce", MIL: "Milan", MON: "Monza",
  NAP: "Napoli", PAR: "Parma", PIS: "Pisa", ROM: "Roma", SAL: "Salernitana",
  SAM: "Sampdoria", SAS: "Sassuolo", SPE: "Spezia", TOR: "Torino", UDI: "Udinese",
  VEN: "Venezia", VER: "Verona",
};
const RUOLO_UNDERSTAT = (pos) => ({ G: "P", D: "D", M: "C", F: "A" }[String(pos ?? "").trim().charAt(0)] ?? "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };

// ---------- fonte 1: Understat ----------
async function fetchUnderstat(stagione) {
  const year = stagione.slice(0, 4); // '2025-26' -> '2025'
  const res = await fetch("https://understat.com/main/getPlayersStats/", {
    method: "POST",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ league: "Serie_A", season: year }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Understat HTTP ${res.status} per ${stagione}`);
  const j = await res.json();
  if (!j.players?.length) throw new Error(`Understat: 0 giocatori per ${stagione}`);
  return j.players.map((p) => ({
    stagione, fonte: "understat",
    nome: p.player_name,
    nome_norm: norm(p.player_name),
    squadra: TEAM_UNDERSTAT[norm(p.team_title)] ?? norm(p.team_title),
    ruolo: RUOLO_UNDERSTAT(p.position),
    presenze: int(p.games), minuti: int(p.time),
    gol: int(p.goals), assist: int(p.assists),
    xg: num(p.xG), xa: num(p.xA), npxg: num(p.npxG),
    tiri: int(p.shots), passaggi_chiave: int(p.key_passes),
    ammonizioni: int(p.yellow_cards), espulsioni: int(p.red_cards),
  }));
}

// ---------- fonte 2: fantacalcio.it statistiche ----------
function parseFcTable(htmlPage, stagione) {
  const rows = [];
  const trRe = /<tr class="player-row"[\s\S]*?<\/tr>/g;
  const cell = (tr, key) => {
    const m = tr.match(new RegExp(`<td[^>]*data-col-key="${key}"[^>]*>([\\s\\S]*?)</td>`));
    return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
  };
  for (const m of htmlPage.matchAll(trRe)) {
    const tr = m[0];
    const nome = tr.match(/<th class="player-name">[\s\S]*?<span>([\s\S]*?)<\/span>/)?.[1]?.trim();
    // L'href del nome contiene l'ID interno fantacalcio.it (…/squadre/…/nome/5512/2025-26):
    // coincide con la colonna Id del listone -> join diretto quando possibile.
    const fcId = tr.match(/player-link[^>]*href="[^"]*\/(\d+)\/[\d-]*"/)?.[1];
    const ruolo = (tr.match(/player-role-classic[^>]*>[\s\S]*?data-value="([pdca])"/)?.[1] ?? "").toUpperCase();
    const sigla = cell(tr, "sq").toUpperCase();
    if (!nome || !sigla) continue;
    const rig = cell(tr, "rig").match(/(\d+)\s*\/\s*(\d+)/); // "segnati / calciati"
    rows.push({
      stagione, fonte: "fantacalcio",
      nome, nome_norm: norm(nome),
      squadra: norm(SIGLA2SQUADRA[sigla] ?? sigla),
      ruolo,
      fc_id: fcId ? int(fcId) : null,
      presenze: int(cell(tr, "pg")),
      media_voto: num(cell(tr, "mv")), fantamedia: num(cell(tr, "mfv")),
      gol: int(cell(tr, "gol")), gol_subiti: int(cell(tr, "gs")),
      rigori_segnati: rig ? int(rig[1]) : null,
      rigori_sbagliati: rig ? Math.max(0, int(rig[2]) - int(rig[1])) : null,
      rigori_parati: int(cell(tr, "rp")),
      assist: int(cell(tr, "ass")),
      ammonizioni: int(cell(tr, "amm")), espulsioni: int(cell(tr, "esp")),
    });
  }
  return rows;
}

async function fetchFantacalcio(stagione) {
  const res = await fetch(`https://www.fantacalcio.it/statistiche-serie-a/${stagione}`, {
    headers: UA, signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`fantacalcio.it HTTP ${res.status} per ${stagione}`);
  const rows = parseFcTable(await res.text(), stagione);
  if (!rows.length) throw new Error(`fantacalcio.it: 0 righe per ${stagione} (markup cambiato? usa --from-json)`);
  return rows;
}

// ---------- main ----------
mkdirSync(join(ROOT, ".data"), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(join(ROOT, "src", "lib", "schema.sqlite.sql"), "utf8"));

// Join official_id sul dataset attivo, in cascata:
// 1) ID interno fantacalcio dall'href (fonte fantacalcio), con verifica compatibilità cognome;
// 2) nome_norm+squadra (fonti con nome esteso, es. Understat);
// 3) cognome+iniziale+squadra (fonti con nome abbreviato "Cognome N.");
// 4) nome unico nel dataset (copre i trasferiti). Altrimenti NULL: mai forzare.
const ds = (db.prepare("SELECT value AS v FROM settings WHERE key='dataset_attivo'").get() ?? { v: null }).v;
const attivi = ds ? db.prepare("SELECT official_id, nome, nome_norm, squadra FROM players WHERE dataset_version=?").all(ds) : [];
const byId = new Map(attivi.map((p) => [p.official_id, p]));
const byKey = new Map(attivi.map((p) => [`${p.nome_norm}|${norm(p.squadra)}`, p.official_id]));
const byNome = new Map();
for (const p of attivi) {
  if (!byNome.has(p.nome_norm)) byNome.set(p.nome_norm, []);
  byNome.get(p.nome_norm).push(p.official_id);
}
const cognomeDi = (nomeNorm) => {
  const tok = nomeNorm.split(" ").filter((t) => t.length > 1);
  return tok[tok.length - 1] ?? nomeNorm; // "lautaro martinez" -> "martinez"; "martinez l" -> "martinez"
};
const inizialeDi = (nomeNorm) => nomeNorm.charAt(0);
function trovaOfficialId(r) {
  if (r.fc_id != null && byId.has(r.fc_id)) {
    const p = byId.get(r.fc_id);
    const cog = cognomeDi(r.nome_norm);
    if (p.nome_norm.includes(cog) || cognomeDi(p.nome_norm) === cog) return p.official_id;
  }
  const bySq = byKey.get(`${r.nome_norm}|${norm(r.squadra)}`);
  if (bySq != null) return bySq;
  // Match tollerante stesso club: listone "De Bruyne"/"Martinez L." vs fonte
  // "Kevin De Bruyne"/"Lautaro Martinez". Ancora cognome + subset token;
  // spareggio su iniziale se >1 ("Rossi M." vs "Rossi F."). Mirror di
  // stessoGiocatore/spareggioIniziale in src/lib/stats.ts.
  const rt = r.nome_norm.split(" ").filter((t) => t.length > 1);
  const cogR = rt[rt.length - 1];
  let cand = cogR ? attivi.filter((p) => {
    if (norm(p.squadra) !== norm(r.squadra)) return false;
    const pL = p.nome_norm.split(" ").filter((t) => t.length > 1);
    return pL.includes(cogR) && pL.every((t) => rt.includes(t));
  }) : [];
  let ids = [...new Set(cand.map((p) => p.official_id))];
  if (ids.length > 1) {
    const ini = r.nome_norm.charAt(0);
    const f = cand.filter((p) => p.nome_norm.split(" ").some((t) => t.startsWith(ini)));
    if (f.length) ids = [...new Set(f.map((p) => p.official_id))];
  }
  if (ids.length === 1) return ids[0];
  const unici = byNome.get(r.nome_norm);
  return unici?.length === 1 ? unici[0] : null;
}

const COLS = ["stagione","fonte","official_id","nome","nome_norm","squadra","ruolo","presenze","minuti",
  "gol","assist","xg","xa","npxg","tiri","passaggi_chiave","ammonizioni","espulsioni",
  "rigori_segnati","rigori_sbagliati","rigori_parati","media_voto","fantamedia","gol_subiti"];
const upsert = db.prepare(`INSERT INTO player_stats (${COLS.join(",")})
  VALUES (${COLS.map(() => "?").join(",")})
  ON CONFLICT(stagione, fonte, nome_norm, squadra) DO UPDATE SET
  ${COLS.filter((c) => !["stagione","fonte","nome_norm","squadra"].includes(c)).map((c) => `${c}=excluded.${c}`).join(", ")},
  updated_at=datetime('now')`);

let totale = 0;
const fonti = FROM_JSON ? [] : (SOURCE === "all" ? ["understat", "fantacalcio"] : [SOURCE]);
const jobs = [];
if (FROM_JSON) {
  const dump = JSON.parse(readFileSync(FROM_JSON, "utf8"));
  jobs.push({ label: `file ${FROM_JSON}`, rows: dump.map((r) => ({ ...r, nome_norm: r.nome_norm ?? norm(r.nome), squadra: norm(r.squadra) })) });
} else {
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
}

for (const job of jobs) {
  const hash = createHash("sha256").update(JSON.stringify(job.rows)).digest("hex").slice(0, 16);
  const key = `stats_hash_${job.label.replace(/\W+/g, "_")}`;
  const cur = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  if (cur?.value === hash) { console.log(`IDEMPOTENTE ${job.label}: invariato, skip.`); continue; }
  let joined = 0;
  const run = () => {
    for (const r0 of job.rows) {
      const r = { official_id: null, ...r0 };
      if (r.official_id == null) r.official_id = trovaOfficialId(r);
      if (r.official_id != null) joined++;
      upsert.run(...COLS.map((c) => r[c] ?? null));
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

// Formato --from-json: array di oggetti con almeno { stagione, fonte, nome, squadra } e le
// colonne metriche opzionali (xg, xa, gol, assist, fantamedia...). Utile se una fonte cambia markup.
