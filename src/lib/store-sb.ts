// Lettura dataset + statistiche da Supabase (produzione/Vercel).
// Solo server (service key). Mirror async di lib/store.ts: stesse forme,
// stessi numeri (fondiStagioni condiviso). Locale resta su SQLite.
import { cache } from "react";
import { getSupabaseServer } from "./db";
import { isSupabaseConfigured } from "./env";
import { fondiStagioni, normSquadra, stessoGiocatore, type StatInputRow } from "./stats";
import type { DatasetInfo, PlayerDetail, PlayerRow } from "./store";

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

function sb() {
  const c = getSupabaseServer();
  if (!c) throw new Error("Supabase non configurato");
  return c;
}

export const getActiveVersionSb = cache(async (): Promise<string | null> => {
  const { data } = await sb().from("settings").select("value").eq("key", "dataset_attivo").maybeSingle();
  return (data?.value as string) ?? null;
});

export async function isImportedSb(): Promise<boolean> {
  const v = await getActiveVersionSb();
  if (!v) return false;
  const { count } = await sb().from("players").select("id", { count: "exact", head: true }).eq("dataset_version", v);
  return (count ?? 0) > 0;
}

type SbPlayer = {
  official_id: number; nome: string; squadra: string;
  ruolo_classic: string; ruolo_mantra: string | null;
  qt_a: number | null; fvm: number | null; pma: number | null;
  is_titolare: boolean | null;
};

const PLAYER_COLS = "official_id,nome,squadra,ruolo_classic,ruolo_mantra,qt_a,fvm,pma,is_titolare";

function toRow(p: SbPlayer): PlayerRow {
  return {
    official_id: p.official_id, nome: p.nome, squadra: p.squadra,
    ruolo_classic: p.ruolo_classic, ruolo_mantra: p.ruolo_mantra ?? "",
    qt_a: p.qt_a, fvm: p.fvm, pma: p.pma,
    is_titolare: p.is_titolare ? 1 : 0,
  };
}

const allPlayersCached = cache(async (version: string): Promise<PlayerRow[]> => {
  const { data, error } = await sb().from("players").select(PLAYER_COLS).eq("dataset_version", version);
  if (error) throw new Error(`players: ${error.message}`);
  return ((data ?? []) as SbPlayer[]).map(toRow);
});

async function allPlayers(version: string): Promise<PlayerRow[]> {
  return allPlayersCached(version);
}

// Dataset della sessione (leggero: niente getState completo).
export async function getSessionDatasetSb(sid: number): Promise<string | null> {
  const { data } = await sb().from("auction_sessions").select("dataset_version").eq("id", sid).maybeSingle();
  return (data?.dataset_version as string) ?? null;
}

export async function searchPlayersSb(q: string, ruolo: string, squadra: string): Promise<PlayerRow[]> {
  const v = await getActiveVersionSb();
  if (!v) return [];
  const needle = q.trim().toLowerCase();
  return (await allPlayers(v))
    .filter((p) =>
      (!needle || p.nome.toLowerCase().includes(needle) || p.squadra.toLowerCase().includes(needle)) &&
      (!ruolo || p.ruolo_classic === ruolo) &&
      (!squadra || p.squadra === squadra)
    )
    .sort((a, b) => (b.qt_a ?? -1) - (a.qt_a ?? -1))
    .slice(0, 200);
}

export async function getFilterOptionsSb(): Promise<{ ruoli: string[]; squadre: string[] }> {
  const v = await getActiveVersionSb();
  if (!v) return { ruoli: [], squadre: [] };
  const ps = await allPlayers(v);
  return {
    ruoli: [...new Set(ps.map((p) => p.ruolo_classic))].sort(),
    squadre: [...new Set(ps.map((p) => p.squadra))].sort(),
  };
}

export async function getDatasetInfoSb(): Promise<DatasetInfo | null> {
  const v = await getActiveVersionSb();
  if (!v) return null;
  const ps = await allPlayers(v);
  if (!ps.length) return null;
  const perRuolo = { P: 0, D: 0, C: 0, A: 0 };
  for (const p of ps) if (p.ruolo_classic in perRuolo) perRuolo[p.ruolo_classic as keyof typeof perRuolo]++;
  return {
    version: v,
    totale: ps.length,
    perRuolo,
    squadre: new Set(ps.map((p) => p.squadra)).size,
    titolari: ps.filter((p) => p.is_titolare).length,
  };
}

const INT_KEYS = new Set([
  "presenze", "minuti", "gol", "assist", "tiri", "passaggi_chiave",
  "ammonizioni", "espulsioni", "rigori_segnati", "rigori_sbagliati",
  "rigori_parati", "gol_subiti", "official_id",
]);
const NUM_KEYS = new Set(["xg", "xa", "npxg", "media_voto", "fantamedia"]);

function toStatInput(r: Record<string, unknown>): StatInputRow {
  const o: Record<string, unknown> = { ...r };
  for (const k of INT_KEYS) o[k] = o[k] === null || o[k] === undefined ? null : Number(o[k]);
  for (const k of NUM_KEYS) o[k] = num(o[k]);
  return o as unknown as StatInputRow;
}

export async function getPlayerDetailSb(officialId: number): Promise<PlayerDetail | null> {
  if (!Number.isInteger(officialId)) return null;
  const v = await getActiveVersionSb();
  if (!v) return null;
  const { data: pl } = await sb().from("players").select(PLAYER_COLS)
    .eq("dataset_version", v).eq("official_id", officialId).maybeSingle();
  if (!pl) return null;
  const p = toRow(pl as SbPlayer);

  const client = sb();
  const { data: joined } = await client.from("player_stats").select("*").eq("official_id", officialId);
  const rows: StatInputRow[] = ((joined ?? []) as Record<string, unknown>[]).map(toStatInput);

  // Recupero non-joinate: stessa logica di statsGiocatore, in JS.
  try {
    // nome_norm listone: serve per match tollerante
    const { data: ident } = await client.from("players").select("nome_norm")
      .eq("dataset_version", v).eq("official_id", officialId).maybeSingle();
    const nomeNorm = (ident?.nome_norm as string) ?? "";
    const have = new Set(rows.map((r) => `${r.stagione}|${r.fonte}`));
    const { data: poolRaw } = await client.from("player_stats").select("*").is("official_id", null);
    const sq = normSquadra(p.squadra);
    const perChiave = new Map<string, StatInputRow[]>();
    for (const raw of ((poolRaw ?? []) as Record<string, unknown>[])) {
      const r = toStatInput(raw);
      if (normSquadra(String(r.squadra ?? "")) !== sq) continue;
      if (!stessoGiocatore(String(r.nome_norm ?? ""), nomeNorm)) continue;
      const k = `${r.stagione}|${r.fonte}`;
      if (have.has(k)) continue;
      perChiave.set(k, [...(perChiave.get(k) ?? []), r]);
    }
    for (const [k, g] of perChiave) {
      let pick = g.length === 1 ? g[0]! : null;
      if (!pick) {
        const f = g.filter((x) =>
          nomeNorm.split(" ").some((t) => t.startsWith(String(x.nome_norm ?? "").charAt(0)))
        );
        pick = f.length === 1 ? f[0]! : null;
      }
      if (pick) { rows.push(pick); have.add(k); }
    }
    rows.sort((a, b) => (a.stagione + a.fonte).localeCompare(b.stagione + b.fonte));
  } catch { /* joinate restano */ }

  return { player: p, dataset: v, stats: { giocatore: { official_id: p.official_id, nome: p.nome, squadra: p.squadra, ruolo: p.ruolo_classic }, ...fondiStagioni(rows) } };
}

export function useSupabase(): boolean {
  return isSupabaseConfigured();
}
