import type { DatabaseSync } from "node:sqlite";
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

export function getPlayer(db: DatabaseSync, dataset: string, officialId: number): Row {
  const p = db.prepare("SELECT * FROM players WHERE dataset_version=? AND official_id=?").get(dataset, officialId) as Row | undefined;
  if (!p) throw new Error(`Giocatore ${officialId} fuori dataset`);
  return p;
}

function median(ns: (number | null)[]): number | null {
  const v = ns.filter((x): x is number => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function mediaReparto(db: DatabaseSync, dataset: string, ruolo: string): number {
  const r = db.prepare("SELECT AVG(qt_a) AS m FROM players WHERE dataset_version=? AND ruolo_classic=?").get(dataset, ruolo) as { m: number | null };
  return Math.round(r.m ?? 1);
}

// 1. prezzoRiferimento
export function prezzoRiferimento(db: DatabaseSync, dataset: string, officialId: number) {
  const p = getPlayer(db, dataset, officialId);
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
  const m = mediaReparto(db, dataset, p.ruolo_classic);
  return { valore: m, formula: "media Qt.A reparto (nessun dato individuale)", input: { ruolo: p.ruolo_classic } };
}

// 2. tettoRilancio(mio manager, giocatore)
export function tettoRilancio(db: DatabaseSync, sid: number, managerId: number, officialId: number) {
  const st = managerStates(db, sid);
  const m = st.find((x) => x.id === managerId);
  if (!m) throw new Error("Manager assente");
  const ds = (db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const p = getPlayer(db, ds, officialId);
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
export function inflazioneAsta(db: DatabaseSync, sid: number) {
  const ds = (db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const rows = db.prepare(
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

export function tettoConsigliato(db: DatabaseSync, sid: number, managerId: number, officialId: number) {
  const ds = (db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string }).d;
  const rif = prezzoRiferimento(db, ds, officialId);
  const tet = tettoRilancio(db, sid, managerId, officialId);
  const p = getPlayer(db, ds, officialId);
  const infl = inflazioneAsta(db, sid).reparti[p.ruolo_classic].valore;
  const adattato = Math.round(rif.valore * infl);
  return {
    riferimento: rif.valore, inflazioneReparto: infl,
    adattato, tettoMax: tet.tetto,
    consigliato: Math.min(adattato, tet.tetto),
    formula: "consigliato = min(riferimento × inflazioneReparto, tettoMax)",
  };
}

// 4. prossimeChiamate: ranking deterministico
export function prossimeChiamate(db: DatabaseSync, sid: number, managerId: number, top = 5) {
  const s = db.prepare("SELECT dataset_version AS d FROM auction_sessions WHERE id=?").get(sid) as { d: string };
  const { rosa } = leagueRules(db);
  const ms = managerStates(db, sid);
  const mine = ms.find((x) => x.id === managerId);
  if (!mine) throw new Error("Manager assente");
  const mod = (db.prepare("SELECT value FROM settings WHERE key='modificatore_default'").get() as { value: string } | undefined)?.value === "on";
  const avail = db.prepare(
    `SELECT p.official_id AS o, p.nome, p.squadra, p.ruolo_classic AS ruolo, p.qt_a AS qt, p.fvm, p.is_titolare AS tit
     FROM players p WHERE p.dataset_version=?
       AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.session_id=? AND pu.player_id=p.id)`
  ).all(s.d, sid) as { o: number; nome: string; squadra: string; ruolo: string; qt: number | null; fvm: number | null; tit: number }[];
  const maxQt: Record<string, number> = {};
  for (const r of avail) maxQt[r.ruolo] = Math.max(maxQt[r.ruolo] ?? 1, r.qt ?? 1);
  const availPer: Record<string, number> = {};
  const needLeague: Record<string, number> = {};
  for (const r of avail) availPer[r.ruolo] = (availPer[r.ruolo] ?? 0) + 1;
  for (const m of ms) for (const [ruolo, t] of Object.entries(rosa)) needLeague[ruolo] = (needLeague[ruolo] ?? 0) + (t - m.slot[ruolo].usati);
  const rank = avail.map((r) => {
    const vuotiMiei = rosa[r.ruolo] - mine.slot[r.ruolo].usati;
    const need = vuotiMiei > 0 ? 1 + vuotiMiei : 0.2;
    const quality = (r.qt ?? 1) / (maxQt[r.ruolo] ?? 1);
    const scarsita = Math.max(0, (needLeague[r.ruolo] ?? 0) - (availPer[r.ruolo] ?? 0)) * 2;
    let bonusMod = 0;
    const motivi: string[] = [];
    if (r.tit) { bonusMod += 0; motivi.push("titolare XI"); }
    if (mod && r.ruolo === "D" && (r.qt ?? 0) >= 14) { bonusMod += 8; motivi.push("modificatore: top D"); }
    if (mod && r.ruolo === "P" && (r.qt ?? 0) >= 15) { bonusMod += 8; motivi.push("modificatore: P clean-sheet"); }
    if (vuotiMiei > 0) motivi.push(`buco rosa: ${vuotiMiei} slot ${r.ruolo} liberi`);
    const score = Math.round(100 * need * (0.5 + 0.5 * quality) + (r.tit ? 10 : 0) + bonusMod + scarsita);
    return { official_id: r.o, nome: r.nome, squadra: r.squadra, ruolo: r.ruolo, score, motivi,
      formula: "100×need×(0.5+0.5×qualità) + 10 se XI + 8 se bonusMod + 2×scarsità" };
  });
  rank.sort((a, b) => b.score - a.score);
  return { top: rank.slice(0, top), modificatore: mod ? "on" : "off", formula: "need=1+slotVuotiMiei (0.2 se ruolo pieno); qualità=Qt/maxQt ruolo; scarsità=max(0,bisognoLega−disponibili)" };
}

// 5. matriceLega: residui + buchi per ruolo + max spesa
export function matriceLega(db: DatabaseSync, sid: number) {
  const ms = managerStates(db, sid);
  return {
    formula: "residui = 500 − speso; buchi = totali − usati; maxSpesa = residui − (vuoti − 1)",
    righe: ms.map((m) => ({
      nome: m.nome, residui: m.residui, speso: m.speso, maxSpesa: m.maxSpesa,
      buchi: Object.fromEntries(Object.entries(m.slot).map(([r, s]) => [r, s.totali - s.usati])),
      usati: Object.fromEntries(Object.entries(m.slot).map(([r, s]) => [r, s.usati])),
    })),
  };
}
