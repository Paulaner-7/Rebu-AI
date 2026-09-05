import type { Db } from "./pgdb";
import { getState, managerStates, ultimaChiamata } from "./auction";
import {
  prezzoRiferimento, prezzoPrevisto, bandaGiocatore, rimanentiRuolo,
  matriceLega, inflazioneAsta, type BandaStats,
} from "./pricing";
import { statsGiocatore } from "./stats";

// Rebu AI — payload pre-cotto per il pulsante (griglia Fase 2).
// Il motore calcola TUTTO in anticipo: l'AI riceve un blocco unico,
// zero tool, una sola chiamata LLM. Numeri sempre tracciabili.

export type RebuAlternativa = {
  o: number; nome: string; qt: number | null; fvm: number | null;
  bandaMin: number; bandaCentro: number; bandaMax: number; segnale: string;
};

export const REBU_SYSTEM = `Sei Rebu, esperto di Fantacalcio Classic 2026/27 (8 squadre, 500 crediti, rose 3P/8D/8C/6A). Ricevi un blocco dati gia verificato dal motore: NON inventare mai numeri, usa solo quelli dati. Rispondi in italiano, max 12 righe: riga 1 = verdetto ALZA / TENTENNA / MOLLA + prezzo fino a cui spingere; poi max 3 motivazioni con numeri stats (xG, FM, forma); poi alternative tra quelle date; chiudi con parere personale in prima persona ("io cosa farei"). Il prezzo DEVE stare dentro la banda indicata. La decisione finale resta dell'utente. Chiudi SEMPRE con blocco JSON: {"azione":"COMPRA|RILANCIA_FINO_A|PASSA","prezzoMassimoConsigliato":n,"confidenza":"BASSA|MEDIA|ALTA","motivazioni":["max 3"],"alternative":["nomi"],"parere":"tuo parere personale"}.`;

export type RebuVerdetto = {
  testo: string;
  azione: "COMPRA" | "RILANCIA_FINO_A" | "PASSA";
  prezzo: number;
  confidenza: "BASSA" | "MEDIA" | "ALTA";
  motivazioni: string[];
  alternative: string[];
  parere: string | null;
  via: "ai" | "motore";
  model: string;
  versione: number;
  rilevante: boolean;
  motivoRilevanza: string;
};

export function extractRebu(testo: string): Omit<RebuVerdetto, "testo" | "via" | "model" | "versione" | "rilevante" | "motivoRilevanza"> | null {
  const m = testo.match(/```json([\s\S]*?)```/) || testo.match(/\{[\s\S]*"azione"[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[1] ?? m[0]) as Record<string, unknown>;
    if (!["COMPRA", "RILANCIA_FINO_A", "PASSA"].includes(o.azione as string)) return null;
    if (!Number.isInteger(o.prezzoMassimoConsigliato)) return null;
    if (!["BASSA", "MEDIA", "ALTA"].includes(o.confidenza as string)) return null;
    if (!Array.isArray(o.motivazioni)) return null;
    return {
      azione: o.azione as RebuVerdetto["azione"],
      prezzo: o.prezzoMassimoConsigliato as number,
      confidenza: o.confidenza as RebuVerdetto["confidenza"],
      motivazioni: (o.motivazioni as unknown[]).map(String).slice(0, 3),
      alternative: Array.isArray(o.alternative) ? (o.alternative as unknown[]).map(String).slice(0, 3) : [],
      parere: typeof o.parere === "string" ? o.parere : null,
    };
  } catch { return null; }
}

function fallbackRebu(p: RebuPayload, model: string): RebuVerdetto {
  const g = p.giocatore;
  const azione = p.slotLiberiRuolo <= 0 || (p.offerta != null && p.offerta > g.banda.max)
    ? "PASSA" : "RILANCIA_FINO_A";
  const top = g.banda.segnali.filter((s) => s.effetto !== 1).slice(0, 2);
  const motivazioni = [
    ...top.map((s) => `${s.etichetta}: ${s.dettaglio}`),
    `banda stats ${g.banda.min}-${g.banda.max} (previsto ${g.previsto.valore})`,
  ].slice(0, 3);
  const testo = azione === "PASSA"
    ? `Motore (AI assente): ${g.nome} no — ${p.motivoRilevanza}. Decisione finale tua.`
    : `Motore (AI assente): ${g.nome} banda ${g.banda.min}-${g.banda.max}, tu fino a ${g.banda.centro}. ${p.motivoRilevanza}. Decisione finale tua.`;
  return {
    testo, azione, prezzo: azione === "PASSA" ? (p.offerta ?? 0) : g.banda.centro,
    confidenza: "MEDIA", motivazioni,
    alternative: p.alternative.slice(0, 3).map((a) => `${a.nome} (${a.bandaMin}-${a.bandaMax})`),
    parere: null, via: "motore", model,
    versione: p.versione, rilevante: p.rilevante, motivoRilevanza: p.motivoRilevanza,
  };
}

// Analisi Rebu in UNA chiamata LLM, zero tool (griglia Fase 3).
// Recinto sicuro: prezzo AI clampato in banda; oltre 10s o errore -> motore.
export async function analisiRebu(db: Db, sid: number, managerId: number, officialId: number, opts?: { forza?: boolean; model?: string }): Promise<RebuVerdetto> {
  const t0 = Date.now();
  const p = await rebuPayload(db, sid, managerId, officialId);
  const model = opts?.model
    ?? (await db.prepare("SELECT value FROM settings WHERE key='modello_default'").get() as { value: string } | undefined)?.value
    ?? (await import("./agent")).DEFAULT_MODEL;
  const key = process.env.OPENCODE_API_KEY ?? "";
  const domanda = `Rebu: ${p.giocatore.nome} (${p.giocatore.ruolo}), offerta ${p.offerta ?? "-"}`;
  const usaAI = (p.rilevante || opts?.forza === true) && key.length > 0;
  const extra = { official_id: officialId, verdetto: null as { azione: string; prezzo: number; via: string } | null };
  if (!usaAI) {
    const f = fallbackRebu(p, model);
    extra.verdetto = { azione: f.azione, prezzo: f.prezzo, via: f.via };
    await logRunSafe(db, sid, domanda, ["rebuPayload", "motore"], f.testo, model, t0, p.versione, extra);
    return f;
  }
  try {
    const g = p.giocatore;
    const user = `Chiamato: ${g.nome} (${g.squadra} ${g.ruolo}${g.titolare ? ", titolare XI" : ""}), Qt ${g.qt_a ?? "-"}, FVM ${g.fvm ?? "-"}, riferimento ${g.riferimento.valore}, previsto chiusura ${g.previsto.valore}. Banda stats: ${g.banda.min}-${g.banda.max}, centro ${g.banda.centro} (k ${g.banda.kStats}, tetto rosa ${g.banda.tettoMax}). Segnali: ${g.banda.segnali.map((s) => `${s.etichetta} x${s.effetto} (${s.dettaglio})`).join("; ")}. Stats sintesi: ${JSON.stringify(p.stats?.sintesi ?? null)}. Offerta attuale: ${p.offerta ?? "nessuna"}. Miei: residui ${p.miei.residui}, slot liberi ${JSON.stringify(p.miei.slotLiberi)}. Alternative stesso ruolo: ${p.alternative.map((a) => `${a.nome} banda ${a.bandaMin}-${a.bandaMax} [${a.segnale}]`).join("; ") || "nessuna"}. Pericoli avversari: ${p.pericoli.map((x) => `${x.nome} (residui ${x.residui}, buchi ${x.buchiRuolo}, max ${x.maxSpesa})`).join("; ") || "nessuno"}. Inflazione reparto: ${p.inflazioneReparto}. Dammi verdetto ora.`;
    const r = await fetch((await import("./agent")).GO_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "system", content: REBU_SYSTEM }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`OpenCode ${r.status}`);
    const testo = (await r.json()).choices?.[0]?.message?.content as string | undefined;
    if (!testo) throw new Error("AI senza risposta");
    const v = extractRebu(testo);
    if (!v) throw new Error("AI senza JSON valido");
    const prezzo = Math.min(Math.max(v.prezzo, g.banda.min), Math.min(g.banda.max, g.banda.tettoMax));
    const pulito = testo.replace(/```json[\s\S]*?```/, "").replace(/\{[\s\S]*"azione"[\s\S]*\}/, "").replace(/\n{3,}/g, "\n\n").trim();
    const out: RebuVerdetto = { testo: pulito || testo.slice(0, 500), ...v, prezzo, via: "ai", model, versione: p.versione, rilevante: p.rilevante, motivoRilevanza: p.motivoRilevanza };
    extra.verdetto = { azione: out.azione, prezzo: out.prezzo, via: out.via };
    await logRunSafe(db, sid, domanda, ["rebuPayload", "rebuAI"], out.testo, model, t0, p.versione, extra);
    return out;
  } catch {
    const f = fallbackRebu(p, model);
    extra.verdetto = { azione: f.azione, prezzo: f.prezzo, via: f.via };
    await logRunSafe(db, sid, domanda, ["rebuPayload", "motore"], f.testo, model, t0, p.versione, extra);
    return f;
  }
}

async function logRunSafe(db: Db, sid: number, domanda: string, tool: string[], risposta: string, modello: string, t0: number, ver: number,
  extra?: { official_id?: number | null; verdetto?: object | null }) {
  try {
    const { logRun } = await import("./agent");
    await logRun(db, sid, domanda, tool, risposta, modello, Date.now() - t0, ver, extra);
  } catch { /* logging mai bloccante */ }
}

export type RebuPayload = {
  giocatore: {
    official_id: number; nome: string; squadra: string; ruolo: string;
    qt_a: number | null; fvm: number | null; pma: number | null; titolare: boolean;
    riferimento: { valore: number; formula: string };
    previsto: { valore: number; formula: string };
    banda: BandaStats;
  };
  stats: { stagioni: unknown[]; sintesi: unknown } | null;
  offerta: number | null;
  rilevante: boolean; motivoRilevanza: string; slotLiberiRuolo: number;
  alternative: RebuAlternativa[];
  miei: { residui: number; slotLiberi: Record<string, number> };
  pericoli: { nome: string; residui: number; buchiRuolo: number; maxSpesa: number }[];
  inflazioneReparto: number;
  versione: number;
};

export async function rebuPayload(db: Db, sid: number, managerId: number, officialId: number): Promise<RebuPayload> {
  const st = await getState(db, sid);
  const ms = await managerStates(db, sid);
  const mine = ms.find((x) => x.id === managerId);
  if (!mine) throw new Error("Manager assente");
  const p = await db.prepare(
    "SELECT official_id, nome, squadra, ruolo_classic, qt_a, fvm, pma, is_titolare FROM players WHERE dataset_version=? AND official_id=?"
  ).get(st.session.dataset, officialId) as {
    official_id: number; nome: string; squadra: string; ruolo_classic: string;
    qt_a: number | null; fvm: number | null; pma: number | null; is_titolare: number;
  } | undefined;
  if (!p) throw new Error(`Giocatore ${officialId} fuori dataset`);

  const [rif, prev, banda, off, rimanenti, matrice, infl] = await Promise.all([
    prezzoRiferimento(db, st.session.dataset, officialId),
    prezzoPrevisto(db, st.session.dataset, officialId),
    bandaGiocatore(db, sid, managerId, officialId),
    ultimaChiamata(db, sid),
    rimanentiRuolo(db, sid, managerId, p.ruolo_classic, 6),
    matriceLega(db, sid),
    inflazioneAsta(db, sid),
  ]);

  let stats: RebuPayload["stats"] = null;
  try {
    const s = await statsGiocatore(db, st.session.dataset, officialId);
    stats = { stagioni: s.stagioni as unknown[], sintesi: s.sintesi as unknown };
  } catch { /* stats assenti: payload resta valido */ }

  const offerta = off?.prezzo ?? null;
  const slot = mine.slot[p.ruolo_classic];
  const slotLiberiRuolo = slot ? slot.totali - slot.usati : 0;
  const rilevante = slotLiberiRuolo > 0 && (offerta == null || offerta <= banda.max);
  const motivoRilevanza = slotLiberiRuolo <= 0
    ? `slot ${p.ruolo_classic} pieni: non ti serve`
    : offerta != null && offerta > banda.max
      ? `offerta ${offerta} oltre banda max ${banda.max}: molla`
      : offerta != null
        ? `offerta ${offerta} dentro banda ${banda.min}-${banda.max}`
        : `chiamato senza offerta, banda ${banda.min}-${banda.max}`;

  // Alternative: top rimanenti stesso ruolo (escluso il chiamato) con loro banda.
  const cand = rimanenti.filter((r) => r.o !== officialId).slice(0, 5);
  const alternative: RebuAlternativa[] = await Promise.all(cand.map(async (r) => {
    let bMin = r.rif, bC = r.tetto, bMax = r.tetto, segnale = "in linea attese";
    try {
      const b = await bandaGiocatore(db, sid, managerId, r.o);
      bMin = b.min; bC = b.centro; bMax = b.max;
      const s = b.segnali.find((x) => x.effetto !== 1);
      if (s) segnale = `${s.etichetta} (x${s.effetto})`;
    } catch { /* banda assente: rif/tetto base */ }
    return { o: r.o, nome: r.nome, qt: r.qt, fvm: r.fvm, bandaMin: bMin, bandaCentro: bC, bandaMax: bMax, segnale };
  }));

  const slotLiberi: Record<string, number> = Object.fromEntries(
    Object.entries(mine.slot).map(([r, s]) => [r, s.totali - s.usati])
  );
  const pericoli = matrice.righe
    .filter((m) => m.nome !== mine.nome && (m.buchi[p.ruolo_classic] ?? 0) > 0)
    .sort((a, b) => b.residui - a.residui)
    .slice(0, 3)
    .map((m) => ({ nome: m.nome, residui: m.residui, buchiRuolo: m.buchi[p.ruolo_classic] ?? 0, maxSpesa: m.maxSpesa }));

  return {
    giocatore: {
      official_id: p.official_id, nome: p.nome, squadra: p.squadra, ruolo: p.ruolo_classic,
      qt_a: p.qt_a, fvm: p.fvm, pma: p.pma, titolare: p.is_titolare === 1,
      riferimento: { valore: rif.valore, formula: rif.formula },
      previsto: { valore: prev.valore, formula: prev.formula },
      banda,
    },
    stats, offerta, rilevante, motivoRilevanza, slotLiberiRuolo, alternative,
    miei: { residui: mine.residui, slotLiberi },
    pericoli,
    inflazioneReparto: infl.reparti[p.ruolo_classic]?.valore ?? 1,
    versione: st.session.versione,
  };
}
