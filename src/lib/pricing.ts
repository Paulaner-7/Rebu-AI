import type { Db } from "./pgdb";
import { managerStates, leagueRules } from "./auction";

// Motore prezzi deterministico (tool futuri agente AI).
// PMA assente nei PDF 26/27 -> riferimento = FVM/2, fallback mediano storiche,
// fallback media reparto. Ogni numero porta formula + input (tracciabilità).

export const REPARTO_SPLIT_NAZIONALE = { P: 0.066, D: 0.213, C: 0.34, A: 0.381 } as const;
// Fonte: 50.175 acquisti reali 26/27 (Fantacalcio-Online, doc scaletta). Percentuali, budget-free.

export type Row = {
  id: number; official_id: number; nome: string; squadra: string; ruolo_classic: string;
  qt_a: number | null; fvm: number | null; pma: number | null;
  qt_2223: number | null; qt_2324: number | null; qt_2425: number | null; qt_2526: number | null;
  is_titolare: number;
};

export async function getPlayer(db: Db, dataset: string, officialId: number): Promise<Row> {
  const p = await db.prepare("SELECT * FROM players WHERE dataset_version=? AND official_id=?").get(dataset, officialId) as Row | undefined;
  if (!p) throw new Error(`Giocatore ${officialId} fuori dataset`);
  return p;
}

function median(ns: (number | null)[]): number | null {
  const v = ns.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

// Statistiche pure per riga giocatore: stesse formule di prezzoRiferimento/
// prezzoPrevisto ma senza query (usate dal batch di rimanentiRuolo).
type StatsRow = {
  pma: number | null; fvm: number | null; qt: number | null;
  qt_2526: number | null; qt_2425: number | null; qt_2324: number | null; qt_2223: number | null;
};

function rifFromStats(r: StatsRow): number | null {
  if (r.pma != null) return Math.round(r.pma * 500);
  if (r.fvm != null) return Math.round(r.fvm / 2);
  return median([r.qt_2526, r.qt_2425, r.qt_2324, r.qt_2223, r.qt]);
}

function prevFromStats(r: StatsRow): number | null {
  const base = r.fvm != null ? r.fvm / 2 : median([r.qt_2526, r.qt_2425, r.qt_2324, r.qt_2223, r.qt]);
  if (base == null) return null;
  let k = 1;
  if (r.qt_2526 != null && r.qt_2425 != null && r.qt_2425 > 0) {
    k = Math.min(1.3, Math.max(0.7, 0.5 + 0.5 * (r.qt_2526 / r.qt_2425)));
  }
  return Math.round(base * k);
}

async function mediaReparto(db: Db, dataset: string, ruolo: string): Promise<number> {
  const r = await db.prepare("SELECT AVG(qt_a) AS m FROM players WHERE dataset_version=? AND ruolo_classic=?").get(dataset, ruolo) as { m: number | null };
  return Math.round(r.m ?? 1);
}

// 1. prezzoRiferimento
export async function prezzoRiferimento(db: Db, dataset: string, officialId: number) {
  const p = await getPlayer(db, dataset, officialId);
  if (p.pma != null) {
    const v = Math.round(p.pma * 500);
    return { valore: v, formula: "PMA × 500", input: { pma: p.pma } };
  }
  if (p.fvm != null) {
    return { valore: Math.round(p.fvm / 2), formula: "FVM / 2 (listone tarato su 1000)", input: { fvm: p.fvm } };
  }
  const med = median([p.qt_2526, p.qt_2425, p.qt_2324, p.qt_2223, p.qt_a]);
  if (med != null) {
    return { valore: med, formula: "mediana(Qt 25/26, 24/25, 23/24, 22/23, Qt.A)", input: { qt_2526: p.qt_2526, qt_2425: p.qt_2425, qt_2324: p.qt_2324, qt_2223: p.qt_2223, qt_a: p.qt_a } };
  }
  const m = await mediaReparto(db, dataset, p.ruolo_classic);
  return { valore: m, formula: "media Qt.A reparto (nessun dato individuale)", input: { ruolo: p.ruolo_classic } };
}

// 1b. prezzoPrevisto: dove CHIUDE asta, non quotazione listone.
// Base = valore mercato (FVM/2, es. Malen 450/2 = 225) corretto per momentum
// ultime stagioni: crescita Qt spinge prezzo, crollo lo affossa. Clamp 0.7–1.3.
// Inflazione live applicata dopo (vedi tettoConsigliato.adattato).
export async function prezzoPrevisto(db: Db, dataset: string, officialId: number) {
  const p = await getPlayer(db, dataset, officialId);
  let base: { v: number; fonte: string };
  if (p.fvm != null) {
    base = { v: p.fvm / 2, fonte: "FVM / 2 (valore mercato)" };
  } else {
    const med = median([p.qt_2526, p.qt_2425, p.qt_2324, p.qt_2223, p.qt_a]);
    base = med != null
      ? { v: med, fonte: "mediana storiche (FVM assente)" }
      : { v: await mediaReparto(db, dataset, p.ruolo_classic), fonte: "media reparto (nessun dato)" };
  }
  let kTrend = 1;
  let trend = "storiche insufficienti: neutro";
  if (p.qt_2526 != null && p.qt_2425 != null && p.qt_2425 > 0) {
    const ratio = p.qt_2526 / p.qt_2425;
    kTrend = Math.min(1.3, Math.max(0.7, 0.5 + 0.5 * ratio));
    trend = `momentum ${p.qt_2425}→${p.qt_2526} (×${Math.round(kTrend * 100) / 100})`;
  }
  const valore = Math.round(base.v * kTrend);
  return {
    valore, formula: `${base.fonte} × trend`,
    input: { base: Math.round(base.v * 10) / 10, kTrend: Math.round(kTrend * 100) / 100, trend, qt_2526: p.qt_2526, qt_2425: p.qt_2425 },
  };
}

// 2. tettoRilancio(mio manager, giocatore)
export async function tettoRilancio(db: Db, sid: number, managerId: number, officialId: number) {
  const st = await managerStates(db, sid);
  const m = st.find((x) => x.id === managerId);
  if (!m) throw new Error("Manager assente");
  const ds = (await db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const p = await getPlayer(db, ds, officialId);
  const slot = m.slot[p.ruolo_classic];
  const okSlot = slot && slot.usati < slot.totali;
  const vuoti = Object.values(m.slot).reduce((a, s) => a + (s.totali - s.usati), 0);
  const tetto = m.residui - (vuoti - 1);
  return {
    tetto: okSlot ? Math.max(0, tetto) : 0,
    formula: "residui − (slotVuoti − 1); 0 se slot ruolo pieni",
    input: { residui: m.residui, slotVuoti: vuoti, ruolo: p.ruolo_classic, slotLiberiRuolo: okSlot },
  };
}

// 3. inflazioneAsta per reparto: pagato / atteso (riferimento), live
export async function inflazioneAsta(db: Db, sid: number) {
  const ds = (await db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const rows = await db.prepare(
    `SELECT pl.ruolo_classic AS ruolo, pu.prezzo, pl.fvm FROM purchases pu
     JOIN players pl ON pl.id=pu.player_id WHERE pu.session_id=?`
  ).all(sid) as { ruolo: string; prezzo: number; fvm: number | null }[];
  const per: Record<string, { pagato: number; atteso: number; n: number }> = {};
  let pt = 0, at = 0;
  for (const r of rows) {
    const att = r.fvm != null ? r.fvm / 2 : null;
    if (att == null || att <= 0) continue;
    (per[r.ruolo] ??= { pagato: 0, atteso: 0, n: 0 });
    per[r.ruolo].pagato += r.prezzo; per[r.ruolo].atteso += att; per[r.ruolo].n++;
    pt += r.prezzo; at += att;
  }
  const out: Record<string, { valore: number; formula: string; n: number }> = {};
  for (const ruolo of ["P", "D", "C", "A"]) {
    const e = per[ruolo];
    out[ruolo] = e
      ? { valore: Math.round((e.pagato / e.atteso) * 100) / 100, formula: "Σ pagati / Σ riferimenti (FVM/2) ruolo", n: e.n }
      : { valore: 1, formula: "nessun acquisto ruolo: neutra 1.0", n: 0 };
  }
  void ds;
  return { reparti: out, totale: at > 0 ? Math.round((pt / at) * 100) / 100 : 1, acquistiValutati: rows.length };
}

export async function tettoConsigliato(db: Db, sid: number, managerId: number, officialId: number) {
  const ds = (await db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const prev = await prezzoPrevisto(db, ds, officialId);
  const tet = await tettoRilancio(db, sid, managerId, officialId);
  const p = await getPlayer(db, ds, officialId);
  const infl = (await inflazioneAsta(db, sid)).reparti[p.ruolo_classic].valore;
  const adattato = Math.round(prev.valore * infl);
  return {
    previsto: prev.valore, formulaPrevisto: prev.formula, inflazioneReparto: infl,
    adattato, tettoMax: tet.tetto,
    consigliato: Math.min(adattato, tet.tetto),
    formula: "soglia = min(previstoAggiudicazione × inflazioneReparto, tettoMax)",
  };
}

// 4. prossimeChiamate: ranking deterministico
// rankAll: base condivisa con rimanentiRuolo (stesso score, stessi motivi).
async function rankAll(db: Db, sid: number, managerId: number) {
  const s = await db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string };
  const { rosa } = await leagueRules(db);
  const ms = await managerStates(db, sid);
  const mine = ms.find((x) => x.id === managerId);
  if (!mine) throw new Error("Manager assente");
  const mod = (await db.prepare("SELECT value FROM settings WHERE key='modificatore_default'").get() as { value: string } | undefined)?.value === "on";
  const avail = await db.prepare(
    `SELECT p.official_id AS o, p.nome, p.squadra, p.ruolo_classic AS ruolo, p.qt_a AS qt, p.fvm, p.pma,
            p.qt_2526, p.qt_2425, p.qt_2324, p.qt_2223, p.is_titolare AS tit
     FROM players p WHERE p.dataset_version=?
       AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.session_id=? AND pu.player_id=p.id)`
  ).all(s.d, sid) as {
    o: number; nome: string; squadra: string; ruolo: string; qt: number | null; fvm: number | null;
    pma: number | null; qt_2526: number | null; qt_2425: number | null; qt_2324: number | null;
    qt_2223: number | null; tit: number;
  }[];
  const maxQt: Record<string, number> = {};
  const pref = await db.prepare("SELECT official_id AS o, tipo FROM preferenze WHERE dataset_version=?").all(s.d) as { o: number; tipo: string }[];
  const prefMap = new Map(pref.map((p) => [p.o, p.tipo]));
  for (const r of avail) maxQt[r.ruolo] = Math.max(maxQt[r.ruolo] ?? 1, r.qt ?? 1);
  const availPer: Record<string, number> = {};
  const needLeague: Record<string, number> = {};
  for (const r of avail) availPer[r.ruolo] = (availPer[r.ruolo] ?? 0) + 1;
  for (const m of ms) for (const [ruolo, t] of Object.entries(rosa)) needLeague[ruolo] = (needLeague[ruolo] ?? 0) + (t - m.slot[ruolo].usati);
  const rank = avail.flatMap((r) => {
    if (prefMap.get(r.o) === "X") return [];
    const vuotiMiei = rosa[r.ruolo] - mine.slot[r.ruolo].usati;
    const need = vuotiMiei > 0 ? 1 + vuotiMiei : 0.2;
    const quality = (r.qt ?? 1) / (maxQt[r.ruolo] ?? 1);
    const scarsita = Math.max(0, (needLeague[r.ruolo] ?? 0) - (availPer[r.ruolo] ?? 0)) * 2;
    let bonusMod = 0;
    const motivi: string[] = [];
    if (r.tit) { bonusMod += 0; motivi.push("titolare XI"); }
    if (prefMap.get(r.o) === "W") { bonusMod += 150; motivi.push("pupillo"); }
    if (mod && r.ruolo === "D" && (r.qt ?? 0) >= 14) { bonusMod += 8; motivi.push("modificatore: top D"); }
    if (mod && r.ruolo === "P" && (r.qt ?? 0) >= 15) { bonusMod += 8; motivi.push("modificatore: P clean-sheet"); }
    if (vuotiMiei > 0) motivi.push(`buco rosa: ${vuotiMiei} slot ${r.ruolo} liberi`);
    const score = Math.round(100 * need * (0.5 + 0.5 * quality) + (r.tit ? 10 : 0) + bonusMod + scarsita);
    return { official_id: r.o, nome: r.nome, squadra: r.squadra, ruolo: r.ruolo, qt: r.qt, fvm: r.fvm, tit: r.tit,
      pma: r.pma, qt_2526: r.qt_2526, qt_2425: r.qt_2425, qt_2324: r.qt_2324, qt_2223: r.qt_2223, score, motivi,
      formula: "100×need×(0.5+0.5×qualità) + 10 se XI + 8 se bonusMod + 150 se pupillo (X esclusi) + 2×scarsità" };
  });
  rank.sort((a, b) => b.score - a.score);
  return { rank, mod: mod ? "on" : "off" };
}

export async function prossimeChiamate(db: Db, sid: number, managerId: number, top = 5) {
  const { rank, mod } = await rankAll(db, sid, managerId);
  const top5 = rank.slice(0, top).map((r) => ({
    official_id: r.official_id, nome: r.nome, squadra: r.squadra, ruolo: r.ruolo,
    score: r.score, motivi: r.motivi, formula: r.formula,
  }));
  return { top: top5, modificatore: mod, formula: "need=1+slotVuotiMiei (0.2 se ruolo pieno); qualità=Qt/maxQt ruolo; scarsità=max(0,bisognoLega−disponibili)" };
}

// 4b. rimanentiRuolo: dopo chiamata di ruolo R, lista ordinata per score con
// statistiche (Qt, FVM, titolarità) + riferimento e tetto squadra owner.
// Batch: rankAll carica già tutte le stats; inflazione/stato manager/tettoMax
// calcolati 1 volta sola (tettoMax identico per tutti i giocatori del ruolo).
// Prima era N+1: ~10 query × 30 giocatori su pool di 2 connessioni.
export async function rimanentiRuolo(db: Db, sid: number, managerId: number, ruolo: string, limit = 30) {
  const s = (await db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid)) as { d: string } | undefined;
  if (!s) throw new Error("Sessione assente");
  const { rank } = await rankAll(db, sid, managerId);
  const infl = (await inflazioneAsta(db, sid)).reparti[ruolo]?.valore ?? 1;
  const ms = await managerStates(db, sid);
  const mine = ms.find((x) => x.id === managerId);
  if (!mine) throw new Error("Manager assente");
  const slot = mine.slot[ruolo];
  const okSlot = slot && slot.usati < slot.totali;
  const vuoti = Object.values(mine.slot).reduce((a, x) => a + (x.totali - x.usati), 0);
  const tettoMax = okSlot ? Math.max(0, mine.residui - (vuoti - 1)) : 0;
  // Media reparto lazy: serve solo a giocatori senza alcun dato individuale.
  let media: number | null = null;
  const mediaOnce = async () => (media ??= await mediaReparto(db, s.d, ruolo));
  const picked = rank.filter((r) => r.ruolo === ruolo).slice(0, Math.min(Math.max(limit, 1), 60));
  return await Promise.all(picked.map(async (r) => {
    const rif = rifFromStats(r) ?? (await mediaOnce());
    const prev = prevFromStats(r) ?? (await mediaOnce());
    const adattato = Math.round(prev * infl);
    return {
      o: r.official_id, nome: r.nome, squadra: r.squadra, ruolo: r.ruolo,
      qt: r.qt, fvm: r.fvm, titolare: r.tit,
      rif, tetto: Math.min(adattato, tettoMax),
      score: r.score, motivi: r.motivi,
    };
  }));
}

// 4c. verdettoRialzo: dopo ogni chiamata, Rebu AI dice ad owner se ALZARE,
// TENTENNARE o MOLLARE. Soglia = prezzo previsto aggiudicazione (non quotazione).
export type Verdetto = {
  verdetto: "ALZA" | "TENTENNA" | "MOLLA";
  titolo: string; dettaglio: string;
  numeri: { offerta: number; previsto: number; adattato: number; tetto: number };
};

export async function verdettoRialzo(db: Db, sid: number, managerId: number, officialId: number, offerta: number): Promise<Verdetto> {
  const ds = (await db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const p = await getPlayer(db, ds, officialId);
  const t = await tettoConsigliato(db, sid, managerId, officialId);
  const numeri = { offerta, previsto: t.previsto, adattato: t.adattato, tetto: t.tettoMax };
  const ms = await managerStates(db, sid);
  const mine = ms.find((x) => x.id === managerId);
  const slotLiberi = mine ? mine.slot[p.ruolo_classic].totali - mine.slot[p.ruolo_classic].usati : 0;
  if (slotLiberi <= 0) {
    return { verdetto: "MOLLA", titolo: "Molla: slot pieni", dettaglio: `Hai già tutti i ${p.ruolo_classic}. Ogni credito qui è sprecato.`, numeri };
  }
  if (offerta > t.tettoMax) {
    return { verdetto: "MOLLA", titolo: "Molla: oltre tuo tetto", dettaglio: `A ${offerta} non ti resterebbe 1 credito per slot vuoti (max ${t.tettoMax}). Lascialo andare.`, numeri };
  }
  if (offerta <= t.adattato) {
    const margine = t.adattato - offerta;
    return { verdetto: "ALZA", titolo: "Alza: sotto prezzo previsto", dettaglio: `Chiude intorno a ${t.previsto} (adattato ${t.adattato}), ora a ${offerta}: margine ${margine}. Rilancia fino a ${Math.min(t.adattato, t.tettoMax)}.`, numeri };
  }
  const pref = await db.prepare("SELECT tipo FROM preferenze WHERE dataset_version=? AND official_id=?").get(ds, officialId) as { tipo: string } | undefined;
  const extra = p.is_titolare ? " È titolare XI." : "";
  const pupillo = pref?.tipo === "W" ? " È tuo pupillo." : "";
  // TENTENNA = range fisso 10 crediti oltre consigliato. Oltre → STOP (MOLLA).
  const limite = t.consigliato + 10;
  if (offerta <= limite) {
    return {
      verdetto: "TENTENNA", titolo: `Tentenna: range 10 fino a ${limite}`,
      dettaglio: `Sopra previsto (${t.adattato}) ma dentro range (consigliato ${t.consigliato} + 10). Alza solo se lo vuoi davvero.${extra}${pupillo} Oltre ${limite} → stop.`,
      numeri,
    };
  }
  return {
    verdetto: "MOLLA", titolo: "Molla: fuori range",
    dettaglio: `Offerta ${offerta} oltre range (consigliato ${t.consigliato} + 10 = ${limite}). Stop: non inseguire.`,
    numeri,
  };
}

// 5. matriceLega: residui + buchi per ruolo + max spesa
export async function matriceLega(db: Db, sid: number) {
  const ms = await managerStates(db, sid);
  return {
    formula: "residui = 500 − speso; buchi = totali − usati; maxSpesa = residui − (vuoti − 1)",
    righe: ms.map((m) => ({
      nome: m.nome, residui: m.residui, speso: m.speso, maxSpesa: m.maxSpesa,
      buchi: Object.fromEntries(Object.entries(m.slot).map(([r, s]) => [r, s.totali - s.usati])),
      usati: Object.fromEntries(Object.entries(m.slot).map(([r, s]) => [r, s.usati])),
    })),
  };
}
