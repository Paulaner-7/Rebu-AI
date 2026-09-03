import { DatabaseSync } from "node:sqlite";
import { writableDb, latestSessionId } from "./auction-store";
import { getState, managerStates } from "./auction";
import { prezzoRiferimento, tettoConsigliato, prossimeChiamate, matriceLega } from "./pricing";
import { searchAvailable } from "./catalog";

export const GO_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
export const GO_MODELS = "https://opencode.ai/zen/go/v1/models";
export const DEFAULT_MODEL = "muse-spark-1.3-contributor";

export const SYSTEM_PROMPT = `Sei Rebu AI, assistente d'asta per il Fantacalcio Classic 2026/27 (8 squadre, 500 crediti, rose 3P/8D/8C/6A, modificatore difesa se attivo). Rispondi in italiano, breve e operativo. Non inventi MAI numeri: quotazioni, prezzi medi, crediti e statistiche arrivano solo dai tool; se un dato manca, dillo. Rispetta le preferenze utente: W = pupillo (spingilo), X = escluso (sconsiglialo salvo richiesta esplicita). Non decidi al posto dell'utente: proponi azione e prezzo massimo motivandoli, e ricorda che la decisione finale è sua, anche quando l'asta si scalda. Chiudi OGNI risposta su giocatore con blocco JSON: {"azione":"COMPRA|RILANCIA_FINO_A|PASSA","prezzoMassimoConsigliato":n,"confidenza":"BASSA|MEDIA|ALTA","motivazioni":["max 3"],"alternative":["Nomi"],"fonti":["tool usati"]}.`;

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
  { type: "function", function: { name: "prossimeChiamate", description: "Ranking chiamate per una squadra", parameters: { type: "object", properties: { managerId: { type: "number" }, top: { type: "number" } }, required: ["managerId"] } } },
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
    case "prossimeChiamate": return prossimeChiamate(db, sid, Number(args.managerId), Number(args.top ?? 5));
    default: return { errore: `tool ${name} sconosciuto` };
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
  const contract: Contract = {
    azione: t.tettoMax <= 1 ? "PASSA" : "RILANCIA_FINO_A",
    prezzoMassimoConsigliato: t.consigliato,
    confidenza: "MEDIA",
    motivazioni: [`riferimento ${t.riferimento} × inflazione ${t.inflazioneReparto}`, `tetto rosa ${t.tettoMax}`, "motore deterministico, AI non configurata"],
    alternative: [], fonti: ["prezzoRiferimento", "tettoRilancio"],
  };
  void domanda;
  return { testo: `Motore (AI non configurata): ${st.nomination.nome} fino a ${t.consigliato}. Decisione finale tua.`, contract, fonti: ["prezzoRiferimento", "tettoRilancio"] };
}

export async function runChat(domanda: string, model?: string) {
  const t0 = Date.now();
  const { db, sid, dataset, versione } = toolCtx();
  const key = process.env.OPENCODE_API_KEY ?? "";
  const modSetting = db.prepare("SELECT value FROM settings WHERE key='modificatore_difesa'").get() as { value: string } | undefined;
  const sysPrompt = SYSTEM_PROMPT + (modSetting?.value === "off" ? "\nModificatore difesa SPENTO in questa lega: non citarlo e non privilegiare difensori/portieri." : "");
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
  for (let i = 0; i < 4; i++) {
    const r = await fetch(GO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: mdl, messages, tools: TOOL_DEFS, tool_choice: "auto" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`OpenCode ${r.status}`);
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
  const contract = extractContract(testo);
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
