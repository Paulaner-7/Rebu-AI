import { DatabaseSync } from "node:sqlite";
import { writableDb, latestSessionId } from "./auction-store";
import { getState, managerStates } from "./auction";
import { prezzoRiferimento, prezzoPrevisto, tettoConsigliato, prossimeChiamate, matriceLega } from "./pricing";
import { kbCerca, kbDigest } from "./knowledge";
import { statsGiocatore, classificaStats } from "./stats";
import { searchAvailable } from "./catalog";
import { verificaNomi, filtraAlternativeValide } from "./rosa-guard";

export const GO_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
export const GO_MODELS = "https://opencode.ai/zen/go/v1/models";
export const DEFAULT_MODEL = "mimo-2.5";

export const SYSTEM_PROMPT = `Sei Rebu AI, esperto di Fantacalcio e tattico d'asta Classic 2026/27 (8 squadre, 500 crediti, rose 3P/8D/8C/6A, modificatore difesa se attivo). Velocità e sintesi prima di tutto. Rispondi in italiano. FORMATO OBBLIGATORIO, max 10 righe totali: riga 1-3 = opzioni numerate con prezzo max ciascuna (es. 1) Affondo Malen fino a 230); poi 1-2 righe di spiegazione con numeri chiave; zero frasi di contorno, zero ripetizioni. Tattiche: affondo top, attesa secondo giro, diversione obiettivo secondario. Leggi prima matriceLega e statoSquadra: muoviti su cosa fanno avversari (chi ha speso troppo, buchi rosa, chi può alzare). Soglia rialzo = prezzo previsto aggiudicazione (prezzoPrevisto), MAI quotazione listone. Priorità dati stagione 2026/27 IN CORSO (quotazione attuale, FVM, titolarità XI, ruolo, squadra): annate precedenti solo supporto, mai verdetto. Esempio: Provedel ottimo anni passati ma oggi secondo Inter → gioca poco → vale poco, trend passato non compensa. Non inventi MAI numeri: solo dai tool; se manca, dillo in una riga. Preferenze: W = pupillo (spingilo), X = escluso (sconsiglialo salvo richiesta). Non decidi tu: opzioni tra cui scegliere, decisione finale è sua. Chiudi OGNI risposta su giocatore con blocco JSON: {"azione":"COMPRA|RILANCIA_FINO_A|PASSA","prezzoMassimoConsigliato":n,"confidenza":"BASSA|MEDIA|ALTA","motivazioni":["max 3"],"alternative":["Nomi"],"fonti":["tool usati"]}. Nomi solo da dataset Serie A 2026/27 via tool (cercaGiocatori, verificaGiocatori, prossimeChiamate): MAI inventare nomi di giocatori; ogni alternativa deve esistere nel dataset, altrimenti scartala in silenzio. Stagione 2026/27 comanda ogni consiglio; stagioni passate = spunto per prevedere il domani, mai verdetto.`;

export type Contract = {
  azione: "COMPRA" | "RILANCIA_FINO_A" | "PASSA";
  prezzoMassimoConsigliato: number;
  confidenza: "BASSA" | "MEDIA" | "ALTA";
  motivazioni: string[];
  alternative: string[];
  fonti: string[];
};

export function validateContract(o: unknown): Contract | null {
  if (!o || typeof o !== "object") return null;
  const c = o as Record<string, unknown>;
  if (!["COMPRA", "RILANCIA_FINO_A", "PASSA"].includes(c.azione as string)) return null;
  if (!Number.isInteger(c.prezzoMassimoConsigliato)) return null;
  if (!["BASSA", "MEDIA", "ALTA"].includes(c.confidenza as string)) return null;
  if (!Array.isArray(c.motivazioni) || c.motivazioni.length > 3) return null;
  return {
    azione: c.azione as Contract["azione"],
    prezzoMassimoConsigliato: c.prezzoMassimoConsigliato as number,
    confidenza: c.confidenza as Contract["confidenza"],
    motivazioni: c.motivazioni as string[],
    alternative: Array.isArray(c.alternative) ? (c.alternative as string[]) : [],
    fonti: Array.isArray(c.fonti) ? (c.fonti as string[]) : [],
  };
}

// --- Tool SOLO lettura ---
function toolCtx() {
  const db = writableDb();
  const sid = latestSessionId();
  if (!sid) throw new Error("Nessuna asta");
  const st = getState(db, sid);
  return { db, sid, dataset: st.session.dataset, versione: st.session.versione };
}

export const TOOL_DEFS = [
  { type: "function", function: { name: "cercaGiocatori", description: "Cerca giocatori disponibili per nome/squadra/ruolo", parameters: { type: "object", properties: { q: { type: "string" }, ruolo: { type: "string" }, squadra: { type: "string" } }, required: ["q"] } } },
  { type: "function", function: { name: "profiloGiocatore", description: "Scheda completa giocatore: dati, riferimento prezzo, titolarità, piazzati", parameters: { type: "object", properties: { officialId: { type: "number" } }, required: ["officialId"] } } },
  { type: "function", function: { name: "statoAsta", description: "Stato asta: fase, nominato, versione dataset", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "statoSquadra", description: "Crediti, slot, rosa di una squadra", parameters: { type: "object", properties: { managerId: { type: "number" } }, required: ["managerId"] } } },
  { type: "function", function: { name: "matriceLega", description: "Residui e buchi rosa di tutte le 8 squadre", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "tettoRilancio", description: "Tetto spesa e consigliato per manager+giocatore", parameters: { type: "object", properties: { managerId: { type: "number" }, officialId: { type: "number" } }, required: ["managerId", "officialId"] } } },
  { type: "function", function: { name: "prezzoRiferimento", description: "Prezzo medio atteso giocatore con formula", parameters: { type: "object", properties: { officialId: { type: "number" } }, required: ["officialId"] } } },
  { type: "function", function: { name: "prezzoPrevisto", description: "Dove chiude asta giocatore (momentum+mercato). Soglia rialzo, non quotazione", parameters: { type: "object", properties: { officialId: { type: "number" } }, required: ["officialId"] } } },
  { type: "function", function: { name: "prossimeChiamate", description: "Ranking chiamate per una squadra", parameters: { type: "object", properties: { managerId: { type: "number" }, top: { type: "number" } }, required: ["managerId"] } } },
  { type: "function", function: { name: "consultaStrategia", description: "Knowledge base strategica d'asta (budget, rilanci, esche, reparti, regole 26/27). Argomento libero o ID esatto es. KB-RIL-01", parameters: { type: "object", properties: { argomento: { type: "string" } }, required: ["argomento"] } } },
  { type: "function", function: { name: "statsGiocatore", description: "Statistiche reali giocatore: 4 stagioni piene + corrente. Gol, assist, xG, xA, MV, FM, presenze", parameters: { type: "object", properties: { officialId: { type: "number" } }, required: ["officialId"] } } },
  { type: "function", function: { name: "classificaStats", description: "Top per metrica (xg|xa|gol|assist|fantamedia|media_voto|presenze) filtrabile per ruolo/stagione", parameters: { type: "object", properties: { metrica: { type: "string" }, ruolo: { type: "string" }, stagione: { type: "string" }, top: { type: "number" } }, required: ["metrica"] } } },
  { type: "function", function: { name: "verificaGiocatori", description: "Verifica nomi contro rosa Serie A 2026/27: ritorna trovati (con FM/gol 26/27) e ignoti da scartare. Usala prima di citare alternative.", parameters: { type: "object", properties: { nomi: { type: "array", items: { type: "string" } } }, required: ["nomi"] } } },
] as const;

export function execTool(db: DatabaseSync, sid: number, dataset: string, name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "cercaGiocatori":
      return searchAvailable(db, sid, dataset, String(args.q ?? ""), String(args.ruolo ?? ""), String(args.squadra ?? ""));
    case "profiloGiocatore": {
      const p = db.prepare("SELECT * FROM players WHERE dataset_version=? AND official_id=?").get(dataset, Number(args.officialId));
      if (!p) return { errore: "assente" };
      const r = p as Record<string, unknown>;
      const pref = db.prepare("SELECT tipo FROM preferenze WHERE dataset_version=? AND official_id=?").get(dataset, Number(args.officialId)) as { tipo: string } | undefined;
      return { ...r, riferimento: prezzoRiferimento(db, dataset, Number(args.officialId)), preferenza: pref?.tipo ?? null };
    }
    case "statoAsta": return getState(db, sid).session;
    case "statoSquadra": return managerStates(db, sid).find((m) => m.id === Number(args.managerId)) ?? { errore: "assente" };
    case "matriceLega": return matriceLega(db, sid);
    case "tettoRilancio": return tettoConsigliato(db, sid, Number(args.managerId), Number(args.officialId));
    case "prezzoRiferimento": return prezzoRiferimento(db, dataset, Number(args.officialId));
    case "prezzoPrevisto": return prezzoPrevisto(db, dataset, Number(args.officialId));
    case "prossimeChiamate": return prossimeChiamate(db, sid, Number(args.managerId), Number(args.top ?? 5));
    case "consultaStrategia": return kbCerca(String(args.argomento ?? ""), 3);
    case "statsGiocatore": return statsGiocatore(db, dataset, Number(args.officialId));
    case "classificaStats": return classificaStats(db, String(args.metrica), String(args.ruolo ?? ""), String(args.stagione ?? ""), Number(args.top ?? 10));
    case "verificaGiocatori": {
      const nomi = Array.isArray(args.nomi) ? (args.nomi as unknown[]).map(String).slice(0, 20) : [String(args.nomi ?? "")];
      const v = verificaNomi(db, dataset, nomi);
      return {
        trovati: v.trovati.map((t) => {
          let live: Record<string, unknown> | null = null;
          try {
            const s = statsGiocatore(db, dataset, t.official_id);
            const stag = (s.stagioni.filter(Boolean) as Record<string, unknown>[]).find((x) => x.stagione === "2026-27") ?? null;
            if (stag) live = { fantamedia: stag.fantamedia ?? null, gol: stag.gol ?? null, xg: stag.xg ?? null, presenze: stag.presenze ?? null };
          } catch { /* stats assenti: riga resta valida */ }
          return { ...t, live_2627: live };
        }),
        ignoti: v.ignoti,
      };
    }
    default: return { errore: `tool ${name} sconosciuto` };
  }
}

// Contesto live verificato nel system prompt: chiamato 26/27 con numeri,
// segnale stats e papabili disponibili. Vuoto se niente asta (chat libera).
export function contestoLive(db: DatabaseSync, sid: number, dataset: string): string {
  try {
    const st = getState(db, sid);
    const owner = st.managers.find((m) => m.is_owner === 1) ?? st.managers[0];
    if (!st.nomination || !owner) return "";
    const p = db.prepare(
      "SELECT nome, squadra, ruolo_classic, qt_a FROM players WHERE dataset_version=? AND official_id=?"
    ).get(dataset, st.nomination.o) as { nome: string; squadra: string; ruolo_classic: string; qt_a: number | null } | undefined;
    if (!p) return "";
    const prev = prezzoPrevisto(db, dataset, st.nomination.o);
    let statsTxt = "stats 26/27 assenti";
    try {
      const s = statsGiocatore(db, dataset, st.nomination.o);
      const sin = s.sintesi as unknown as { fantamedia_media: number | null; scarto_gol_meno_xg: number };
      const live = (s.stagioni.filter(Boolean) as Record<string, unknown>[]).find((x) => x.stagione === "2026-27");
      const fmLive = live && typeof live.fantamedia === "number" ? live.fantamedia : null;
      statsTxt = `FM media ${sin.fantamedia_media ?? "—"}, FM 26/27 ${fmLive ?? "—"}, scarto gol−xG ${sin.scarto_gol_meno_xg}`;
    } catch { /* tabelle stats vuote */ }
    let papabili = "";
    try {
      papabili = filtraAlternativeValide(db, dataset, prossimeChiamate(db, sid, owner.id, 3).top.map((r) => r.nome)).join(", ");
    } catch { /* ranking assente */ }
    let disp = "?";
    try {
      disp = String((db.prepare(
        "SELECT COUNT(*) AS n FROM players p WHERE p.dataset_version=? AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.session_id=? AND pu.player_id=p.id)"
      ).get(dataset, sid) as { n: number }).n);
    } catch { /* conteggio assente */ }
    return `\nChiamato live verificato 26/27: ${p.nome} (${p.squadra} ${p.ruolo_classic}, Qt ${p.qt_a ?? "—"}) — previsto ${prev.valore}; ${statsTxt}. Disponibili: ${disp}.${papabili ? ` Papabili: ${papabili}.` : ""}`;
  } catch {
    return "";
  }
}

// Fallback deterministico quando AI non configurata / errore
export function fallbackAnswer(db: DatabaseSync, sid: number, dataset: string, versione: number, domanda: string) {
  const st = getState(db, sid);
  const owner = st.managers.find((m) => m.is_owner === 1) ?? st.managers[0];
  if (!st.nomination || !owner) {
    return { testo: "Nomina un giocatore in pagina Asta e richiederò sul chiamato.", contract: null as Contract | null, fonti: ["statoAsta"] };
  }
  const t = tettoConsigliato(db, sid, owner.id, st.nomination.o);
  // Alternative = papabili reali disponibili (mai nomi inventati).
  let alternative: string[] = [];
  try {
    alternative = filtraAlternativeValide(
      db, dataset,
      prossimeChiamate(db, sid, owner.id, 3).top.map((r) => r.nome)
    ).slice(0, 3);
  } catch { /* ranking assente: nessuna alternativa */ }
  // Segnale stats 26/27 + storico (degrada a null se tabelle vuote).
  let segnale = "";
  const fonti = ["prezzoPrevisto", "tettoRilancio"];
  try {
    const s = statsGiocatore(db, dataset, st.nomination.o);
    const sin = s.sintesi as unknown as { fantamedia_media: number | null; scarto_gol_meno_xg: number };
    const live = (s.stagioni.filter(Boolean) as Record<string, unknown>[]).find((x) => x.stagione === "2026-27");
    const fmLive = live && typeof live.fantamedia === "number" ? `, FM 26/27 ${live.fantamedia}` : "";
    segnale = ` Segnale stats: FM media ${sin.fantamedia_media ?? "—"}${fmLive}, scarto gol−xG ${sin.scarto_gol_meno_xg}.`;
    fonti.push("statsGiocatore");
  } catch { /* stats assenti */ }
  const contract: Contract = {
    azione: t.tettoMax <= 1 ? "PASSA" : "RILANCIA_FINO_A",
    prezzoMassimoConsigliato: t.consigliato,
    confidenza: "MEDIA",
    motivazioni: [`previsto chiusura ${t.previsto} × inflazione ${t.inflazioneReparto}`, `tetto rosa ${t.tettoMax}`, "motore deterministico, AI non configurata"],
    alternative, fonti,
  };
  void domanda;
  const altTxt = alternative.length ? ` Alternative verificate 26/27: ${alternative.join(", ")}.` : "";
  return { testo: `Motore (AI non configurata): ${st.nomination.nome} chiude ~${t.previsto}, tu fino a ${t.consigliato}.${segnale}${altTxt} Decisione finale tua.`, contract, fonti };
}

export async function runChat(domanda: string, model?: string) {
  const t0 = Date.now();
  const { db, sid, dataset, versione } = toolCtx();
  const key = process.env.OPENCODE_API_KEY ?? "";
  const modSetting = db.prepare("SELECT value FROM settings WHERE key='modificatore_difesa'").get() as { value: string } | undefined;
  const sysPrompt = SYSTEM_PROMPT
    + kbDigest(900)   // principi KB in ~20 righe; dettagli via tool consultaStrategia
    + "\nPer tattiche d'asta usa consultaStrategia e cita gli ID KB in fonti. Per numeri su performance passate usa statsGiocatore/classificaStats."
    + contestoLive(db, sid, dataset)
    + (modSetting?.value === "off" ? "\nModificatore difesa SPENTO in questa lega: non citarlo e non privilegiare difensori/portieri." : "");
  const mdl = model || (db.prepare("SELECT value FROM settings WHERE key='modello_default'").get() as { value: string } | undefined)?.value || DEFAULT_MODEL;
  const usati: string[] = [];

  if (!key) {
    const f = fallbackAnswer(db, sid, dataset, versione, domanda);
    logRun(db, sid, domanda, f.fonti, f.testo, mdl, Date.now() - t0, versione);
    return { testo: f.testo, contract: f.contract, model: mdl, via: "motore", versione };
  }

  const messages: { role: string; content: string; tool_calls?: unknown; tool_call_id?: string; name?: string }[] = [
    { role: "system", content: sysPrompt },
    { role: "user", content: domanda },
  ];
  let testo = "";
  for (let i = 0; i < 2; i++) { // 2 giri max: risposte rapide, tool batchati insieme
    const r = await fetch(GO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: mdl, messages, tools: TOOL_DEFS, tool_choice: "auto" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`OpenCode ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const msg = j.choices?.[0]?.message;
    if (!msg) break;
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    const calls = msg.tool_calls as { id: string; function: { name: string; arguments: string } }[] | undefined;
    if (!calls?.length) { testo = msg.content ?? ""; break; }
    for (const c of calls) {
      usati.push(c.function.name);
      let out: unknown;
      try { out = execTool(db, sid, dataset, c.function.name, JSON.parse(c.function.arguments || "{}")); }
      catch (e) { out = { errore: e instanceof Error ? e.message : "errore" }; }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 4000) });
    }
  }
  // Se modello esaurisce giri solo con tool (niente testo), una sintesi finale senza tool.
  if (!testo && usati.length > 0) {
    messages.push({ role: "user", content: "Sintetizza ora in max 10 righe col formato obbligatorio. Niente altri tool." });
    const r = await fetch(GO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: mdl, messages, tool_choice: "none" }),
      signal: AbortSignal.timeout(20000),
    });
    if (r.ok) testo = (await r.json()).choices?.[0]?.message?.content ?? "";
  }
  if (!testo) throw new Error("AI senza risposta (modello muto). Riprova o cambia modello in pagina Chat.");
  // Guard rosa: alternative fuori Serie A 26/27 vengono droppate, mai mostrate.
  let contract = extractContract(testo);
  if (contract?.alternative?.length) {
    try {
      const valide = filtraAlternativeValide(db, dataset, contract.alternative);
      if (valide.length !== contract.alternative.length) {
        contract = { ...contract, alternative: valide, fonti: [...new Set([...contract.fonti, "verificaDataset"])] };
        usati.push("verificaDataset");
      }
    } catch { /* guard indisponibile: contract intatto */ }
  }
  // Blocco JSON resta in scheda contratto: via dal testo leggibile.
  testo = testo.replace(/```json[\s\S]*?```/, "").replace(/\{[\s\S]*"azione"[\s\S]*\}/, "").replace(/\n{3,}/g, "\n\n").trim();
  logRun(db, sid, domanda, usati, testo, mdl, Date.now() - t0, versione);
  return { testo, contract, model: mdl, via: "ai", versione };
}

export function extractContract(testo: string): Contract | null {
  const m = testo.match(/```json([\s\S]*?)```/) || testo.match(/\{[\s\S]*"azione"[\s\S]*\}/);
  if (!m) return null;
  try { return validateContract(JSON.parse(m[1] ?? m[0])); } catch { return null; }
}

function logRun(db: DatabaseSync, sid: number, domanda: string, tool: string[], risposta: string, modello: string, lat: number, ver: number) {
  db.prepare("INSERT INTO agent_runs (session_id, domanda, tool_calls, output, state_version, latenza_ms) VALUES (?,?,?,?,?,?)")
    .run(sid, domanda, JSON.stringify(tool), JSON.stringify({ risposta: risposta.slice(0, 2000), modello }), ver, lat);
}

export async function listModels(): Promise<{ id: string }[]> {
  const key = process.env.OPENCODE_API_KEY ?? "";
  if (!key) return [];
  try {
    const r = await fetch(GO_MODELS, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const j = await r.json();
    const arr = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    return arr.map((m: { id?: string; name?: string }) => ({ id: m.id ?? m.name ?? "" })).filter((m: { id: string }) => m.id);
  } catch { return []; }
}
