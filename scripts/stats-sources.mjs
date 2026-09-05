// Rebu AI — sorgenti stats condivise tra scripts/sync-stats.mjs (locale)
// e src/lib/sync-stats.ts (route prod su Supabase). Puro fetch+parse+join,
// nessuna connessione DB qui dentro: il chiamante passa le righe e scrive.
export const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) RebuAI/1.0 (stats sync settimanale)", "Accept-Language": "it-IT,it;q=0.9" };

export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’‘`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- mappe squadre -> nome usato dal listone fantacalcio.it ---
export const TEAM_UNDERSTAT = {
  "ac milan": "milan", "parma calcio 1913": "parma", "hellas verona": "verona",
  inter: "inter", roma: "roma", napoli: "napoli", juventus: "juventus", lazio: "lazio",
  atalanta: "atalanta", fiorentina: "fiorentina", torino: "torino", bologna: "bologna",
  udinese: "udinese", genoa: "genoa", cagliari: "cagliari", como: "como", lecce: "lecce",
  pisa: "pisa", sassuolo: "sassuolo", cremonese: "cremonese", empoli: "empoli",
  venezia: "venezia", monza: "monza", salernitana: "salernitana", frosinone: "frosinone",
  spezia: "spezia", sampdoria: "sampdoria", benevento: "benevento", crotone: "crotone",
};
export const SIGLA2SQUADRA = {
  ATA: "Atalanta", BOL: "Bologna", CAG: "Cagliari", COM: "Como", CRE: "Cremonese",
  EMP: "Empoli", FIO: "Fiorentina", FRO: "Frosinone", GEN: "Genoa", INT: "Inter",
  JUV: "Juventus", LAZ: "Lazio", LEC: "Lecce", MIL: "Milan", MON: "Monza",
  NAP: "Napoli", PAR: "Parma", PIS: "Pisa", ROM: "Roma", SAL: "Salernitana",
  SAM: "Sampdoria", SAS: "Sassuolo", SPE: "Spezia", TOR: "Torino", UDI: "Udinese",
  VEN: "Venezia", VER: "Verona",
};
export const RUOLO_UNDERSTAT = (pos) => ({ G: "P", D: "D", M: "C", F: "A" }[String(pos ?? "").trim().charAt(0)] ?? "");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const num = (v) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
export const int = (v) => { const n = num(v); return n === null ? null : Math.round(n); };

// ---------- fonte 1: Understat ----------
export async function fetchUnderstat(stagione) {
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
export function parseFcTable(htmlPage, stagione) {
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

export async function fetchFantacalcio(stagione) {
  const res = await fetch(`https://www.fantacalcio.it/statistiche-serie-a/${stagione}`, {
    headers: UA, signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`fantacalcio.it HTTP ${res.status} per ${stagione}`);
  const rows = parseFcTable(await res.text(), stagione);
  if (!rows.length) throw new Error(`fantacalcio.it: 0 righe per ${stagione} (markup cambiato?)`);
  return rows;
}

// ---------- join official_id sul dataset attivo, in cascata ----------
// 1) ID interno fantacalcio dall'href, con verifica compatibilità cognome;
// 2) nome_norm+squadra; 3) cognome+iniziale+squadra; 4) nome unico nel
// dataset. Altrimenti NULL: mai forzare. Mirror di stessoGiocatore in stats.ts.
export function makeTrovaOfficialId(attivi) {
  const byId = new Map(attivi.map((p) => [p.official_id, p]));
  const byKey = new Map(attivi.map((p) => [`${p.nome_norm}|${norm(p.squadra)}`, p.official_id]));
  const byNome = new Map();
  for (const p of attivi) {
    if (!byNome.has(p.nome_norm)) byNome.set(p.nome_norm, []);
    byNome.get(p.nome_norm).push(p.official_id);
  }
  const cognomeDi = (nomeNorm) => {
    const tok = nomeNorm.split(" ").filter((t) => t.length > 1);
    return tok[tok.length - 1] ?? nomeNorm;
  };
  return function trovaOfficialId(r) {
    if (r.fc_id != null && byId.has(r.fc_id)) {
      const p = byId.get(r.fc_id);
      const cog = cognomeDi(r.nome_norm);
      if (p.nome_norm.includes(cog) || cognomeDi(p.nome_norm) === cog) return p.official_id;
    }
    const bySq = byKey.get(`${r.nome_norm}|${norm(r.squadra)}`);
    if (bySq != null) return bySq;
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
  };
}

export const COLS = ["stagione", "fonte", "official_id", "nome", "nome_norm", "squadra", "ruolo", "presenze", "minuti",
  "gol", "assist", "xg", "xa", "npxg", "tiri", "passaggi_chiave", "ammonizioni", "espulsioni",
  "rigori_segnati", "rigori_sbagliati", "rigori_parati", "media_voto", "fantamedia", "gol_subiti"];
