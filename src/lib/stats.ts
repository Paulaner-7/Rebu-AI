// Rebu AI — lettura statistiche giocatori (tabella player_stats, vedi migrazione 0004).
// Due fonti fuse per stagione: 'fantacalcio' (PV, MV, FM, gol, assist, rigori, cartellini)
// e 'understat' (xG, xA, npxG, tiri, passaggi chiave). Nessun numero inventato:
// se una fonte manca, il campo è null e la sintesi lo dichiara.
import type { DatabaseSync } from "node:sqlite";

export type StatsRow = {
  stagione: string; fonte: string; nome: string; nome_norm: string; squadra: string; ruolo: string;
  presenze: number | null; minuti: number | null;
  gol: number | null; assist: number | null;
  xg: number | null; xa: number | null; npxg: number | null;
  tiri: number | null; passaggi_chiave: number | null;
  ammonizioni: number | null; espulsioni: number | null;
  rigori_segnati: number | null; rigori_sbagliati: number | null; rigori_parati: number | null;
  media_voto: number | null; fantamedia: number | null; gol_subiti: number | null;
};

const METRICHE = new Set(["xg", "xa", "gol", "assist", "fantamedia", "media_voto", "presenze", "tiri", "passaggi_chiave"]);
const ORDINE_STAGIONI = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"];

function getPlayerIdentity(db: DatabaseSync, dataset: string, officialId: number) {
  const p = db.prepare(
    "SELECT official_id, nome, nome_norm, squadra, ruolo_classic FROM players WHERE dataset_version=? AND official_id=?"
  ).get(dataset, officialId) as { official_id: number; nome: string; nome_norm: string; squadra: string; ruolo_classic: string } | undefined;
  if (!p) throw new Error(`Giocatore ${officialId} fuori dataset`);
  return p;
}

export function normSquadra(s: string): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.'’‘`]/g, "").replace(/\s+/g, " ").trim();
}

// Match tollerante listone <-> fonti (Understat usa nome esteso, listone
// cognome secco "De Bruyne" o abbreviato "Martinez L."). Regola: ancora
// cognome (ultimo token lungo fonte nei token listone) + tutti i token lunghi
// del listone contenuti nella fonte. Spareggio su iniziale se >1 candidato.
// Mirror in scripts/sync-stats.mjs (trovaOfficialId) e backfill-stats-join.mjs.
export function stessoGiocatore(rNomeNorm: string, pNomeNorm: string): boolean {
  const rL = rNomeNorm.split(" ").filter((t) => t.length > 1);
  const pL = pNomeNorm.split(" ").filter((t) => t.length > 1);
  if (!rL.length || !pL.length) return false;
  if (!pL.includes(rL[rL.length - 1] as string)) return false;
  return pL.every((t) => rL.includes(t));
}

export function spareggioIniziale(rNomeNorm: string, cands: string[]): string[] {
  const ini = rNomeNorm.charAt(0);
  const f = cands.filter((c) => c.split(" ").some((t) => t.startsWith(ini)));
  return f.length ? f : cands;
}

export type StatInputRow = StatsRow & { official_id: number | null };

// Fonde per stagione: numeri di conto da fantacalcio, avanzate da understat.
// Pura: riusata da store locale e Supabase (stessi numeri ovunque).
export function fondiStagioni(rows: StatInputRow[]) {
  const perStagione = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const s = perStagione.get(r.stagione) ?? { stagione: r.stagione, fonti: [] as string[] };
    (s.fonti as string[]).push(r.fonte);
    if (r.fonte === "fantacalcio") {
      Object.assign(s, {
        presenze: r.presenze, gol: r.gol, assist: r.assist,
        media_voto: r.media_voto, fantamedia: r.fantamedia,
        ammonizioni: r.ammonizioni, espulsioni: r.espulsioni,
        rigori_segnati: r.rigori_segnati, rigori_sbagliati: r.rigori_sbagliati,
        rigori_parati: r.rigori_parati, gol_subiti: r.gol_subiti,
      });
    }
    if (r.fonte === "understat") {
      Object.assign(s, {
        minuti: r.minuti, xg: r.xg, xa: r.xa, npxg: r.npxg,
        tiri: r.tiri, passaggi_chiave: r.passaggi_chiave,
        // Understat ha gol/assist "reali": riempie solo se la fonte ufficiale manca.
        gol: (s.gol as number | null) ?? r.gol, assist: (s.assist as number | null) ?? r.assist,
        presenze: (s.presenze as number | null) ?? r.presenze,
      });
    }
    perStagione.set(r.stagione, s);
  }
  const stagioni = ORDINE_STAGIONI.filter((st) => perStagione.has(st)).map((st) => perStagione.get(st)!);

  // Sintesi multi-anno per il modello: totali e segnali xG vs gol.
  const somma = (k: string) => stagioni.reduce((a, s) => a + (typeof s[k] === "number" ? (s[k] as number) : 0), 0);
  const totGol = somma("gol"), totXg = Math.round(somma("xg") * 10) / 10;
  const totAss = somma("assist"), totXa = Math.round(somma("xa") * 10) / 10;
  const fmValide = stagioni.filter((s) => typeof s.fantamedia === "number");
  const sintesi = {
    stagioni_coperte: stagioni.length,
    gol_totali: totGol, xg_totali: totXg, scarto_gol_meno_xg: Math.round((totGol - totXg) * 10) / 10,
    assist_totali: totAss, xa_totali: totXa, scarto_assist_meno_xa: Math.round((totAss - totXa) * 10) / 10,
    fantamedia_media: fmValide.length
      ? Math.round((fmValide.reduce((a, s) => a + (s.fantamedia as number), 0) / fmValide.length) * 100) / 100
      : null,
    nota: "scarto gol−xG molto positivo per 2+ stagioni = possibile sovrarendimento (rischio regressione); negativo = possibile scommessa (KB-STA-01)",
  };
  return {
    stagioni, sintesi,
    formula: "fonti fuse per stagione: conto/fantamedia da fantacalcio.it, xG/xA da Understat; NULL = dato assente, mai stimato",
  };
}

// Statistiche complete di un giocatore: 4 stagioni piene + corrente, fonti fuse.
// Variante SQLite: fetch righe + recupero non-joinate, poi fondiStagioni.
export function statsGiocatore(db: DatabaseSync, dataset: string, officialId: number) {
  const p = getPlayerIdentity(db, dataset, officialId);
  const rows = db.prepare(
    `SELECT * FROM player_stats
     WHERE (official_id = ? OR (nome_norm = ? AND lower(squadra) = ?))
     ORDER BY stagione, fonte`
  ).all(officialId, p.nome_norm, normSquadra(p.squadra)) as unknown as StatInputRow[];
  // Recupero righe non joinate (official_id NULL): stesso club + match
  // tollerante, solo se candidato unico per (stagione, fonte). Mai forzato.
  try {
    const have = new Set(rows.map((r) => `${r.stagione}|${r.fonte}`));
    const pool = db.prepare(
      `SELECT * FROM player_stats WHERE official_id IS NULL AND lower(squadra) = ?`
    ).all(normSquadra(p.squadra)) as unknown as StatInputRow[];
    const perChiave = new Map<string, typeof pool>();
    for (const r of pool) {
      if (!stessoGiocatore(r.nome_norm, p.nome_norm)) continue;
      const k = `${r.stagione}|${r.fonte}`;
      if (have.has(k)) continue;
      perChiave.set(k, [...(perChiave.get(k) ?? []), r]);
    }
    for (const [k, g] of perChiave) {
      // Unico in (stagione, fonte) -> si prende; se >1, resta solo la riga
      // la cui iniziale combacia coi token del listone ("Rossi M." vs "Rossi F.").
      let pick = g.length === 1 ? g[0]! : null;
      if (!pick) {
        const f = g.filter((x) =>
          p.nome_norm.split(" ").some((t) => t.startsWith(x.nome_norm.charAt(0)))
        );
        pick = f.length === 1 ? f[0]! : null;
      }
      if (pick) { rows.push(pick); have.add(k); }
    }
    rows.sort((a, b) => (a.stagione + a.fonte).localeCompare(b.stagione + b.fonte));
  } catch { /* fallback assente: righe joinate restano */ }
  const fused = fondiStagioni(rows);
  return {
    giocatore: { official_id: p.official_id, nome: p.nome, squadra: p.squadra, ruolo: p.ruolo_classic },
    ...fused,
  };
}

// Classifica per metrica (solo disponibili, non ancora venduti se passi sessione).
export function classificaStats(
  db: DatabaseSync, metrica: string, ruolo = "", stagione = "", top = 10,
) {
  const m = metrica.toLowerCase();
  if (!METRICHE.has(m)) return { errore: `metrica ${metrica} non valida`, valide: [...METRICHE] };
  const stag = stagione || "2026-27";
  const fonte = ["xg", "xa", "tiri", "passaggi_chiave"].includes(m) ? "understat" : "fantacalcio";
  const rows = db.prepare(
    `SELECT ps.official_id, ps.nome, ps.squadra, ps.ruolo, ps.${m} AS valore, ps.presenze, ps.minuti
     FROM player_stats ps
     WHERE ps.stagione = ? AND ps.fonte = ? AND ps.${m} IS NOT NULL
       AND (? = '' OR ps.ruolo = ?)
     ORDER BY ps.${m} DESC LIMIT ?`
  ).all(stag, fonte, ruolo.toUpperCase(), ruolo.toUpperCase(), Math.min(Math.max(top, 1), 50));
  return { stagione: stag, metrica: m, fonte, top: rows, nota: "ruolo = quello registrato dalla fonte nella stagione (può differire dal Classic attuale)" };
}
