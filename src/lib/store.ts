import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { ensureDataset } from "./ensure-dataset";
import { statsGiocatore } from "./stats";
import { makeDb, type Db } from "./pgdb";

const DB_PATH = join(process.cwd(), ".data", "rebu.db");

let raw: DatabaseSync | null = null;
function conn(): Db | null {
  ensureDataset(); // DB auto-pronto aprendo sito (idempotente, throttled)
  try {
    if (!raw) raw = new DatabaseSync(DB_PATH, { readOnly: true });
    return makeDb(raw);
  } catch {
    return null; // DB non ancora importato: pagina mostra guida
  }
}

export async function isImported(): Promise<boolean> {
  const c = conn();
  if (!c) return false;
  try {
    return (((await c.prepare("SELECT COUNT(*) AS n FROM players").get()) as { n: number }).n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function getActiveVersion(): Promise<string | null> {
  const c = conn();
  if (!c) return null;
  try {
    const r = (await c.prepare("SELECT value FROM settings WHERE key='dataset_attivo'").get()) as
      | { value: string }
      | undefined;
    return r?.value ?? null;
  } catch {
    return null;
  }
}

export type PlayerRow = {
  official_id: number;
  nome: string;
  squadra: string;
  ruolo_classic: string;
  ruolo_mantra: string;
  qt_a: number | null;
  fvm: number | null;
  pma: number | null;
  is_titolare: number;
};

export async function searchPlayers(q: string, ruolo: string, squadra: string): Promise<PlayerRow[]> {
  const c = conn();
  if (!c) return [];
  const like = `%${q.toLowerCase()}%`;
  return (await c
    .prepare(
      `SELECT official_id, nome, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, pma, is_titolare
       FROM players
       WHERE (lower(nome) LIKE ? OR lower(squadra) LIKE ?)
         AND (? = '' OR ruolo_classic = ?)
         AND (? = '' OR squadra = ?)
       ORDER BY qt_a DESC LIMIT 200`
    )
    .all(like, like, ruolo, ruolo, squadra, squadra)) as PlayerRow[];
}

export type DatasetInfo = {
  version: string;
  totale: number;
  perRuolo: { P: number; D: number; C: number; A: number };
  squadre: number;
  titolari: number;
};

// Conteggi reali dal DB (auto-importato). Null se DB assente.
export async function getDatasetInfo(): Promise<DatasetInfo | null> {
  const c = conn();
  if (!c) return null;
  try {
    const version = await getActiveVersion();
    if (!version) return null;
    const totale = ((await c.prepare("SELECT COUNT(*) AS n FROM players WHERE dataset_version=?").get(version)) as { n: number }).n;
    if (!totale) return null;
    const perRuolo = { P: 0, D: 0, C: 0, A: 0 };
    for (const r of (await c.prepare("SELECT ruolo_classic AS ruolo, COUNT(*) AS n FROM players WHERE dataset_version=? GROUP BY ruolo_classic").all(version)) as { ruolo: string; n: number }[]) {
      if (r.ruolo in perRuolo) perRuolo[r.ruolo as keyof typeof perRuolo] = r.n;
    }
    const squadre = ((await c.prepare("SELECT COUNT(DISTINCT squadra) AS n FROM players WHERE dataset_version=?").get(version)) as { n: number }).n;
    const titolari = ((await c.prepare("SELECT COUNT(*) AS n FROM players WHERE dataset_version=? AND is_titolare=1").get(version)) as { n: number }).n;
    return { version, totale, perRuolo, squadre, titolari };
  } catch {
    return null;
  }
}

export type PlayerDetail = {
  player: PlayerRow;
  dataset: string;
  stats: Awaited<ReturnType<typeof statsGiocatore>>;
};

// Scheda singolo giocatore + statistiche fuse (stagione live + storico).
// Ritorna null se DB assente o id fuori dataset: pagina mostra EmptyState.
export async function getPlayerDetail(officialId: number): Promise<PlayerDetail | null> {
  const c = conn();
  if (!c || !Number.isInteger(officialId)) return null;
  try {
    const version = await getActiveVersion();
    if (!version) return null;
    const p = (await c
      .prepare(
        `SELECT official_id, nome, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, pma, is_titolare
         FROM players WHERE dataset_version=? AND official_id=?`
      )
      .get(version, officialId)) as PlayerRow | undefined;
    if (!p) return null;
    return { player: p, dataset: version, stats: await statsGiocatore(c, version, officialId) };
  } catch {
    return null;
  }
}

export async function getFilterOptions(): Promise<{ ruoli: string[]; squadre: string[] }> {
  const c = conn();
  if (!c) return { ruoli: [], squadre: [] };
  const ruoli = ((await c.prepare("SELECT DISTINCT ruolo_classic AS v FROM players ORDER BY v").all()) as { v: string }[]).map(
    (r) => r.v
  );
  const squadre = ((await c.prepare("SELECT DISTINCT squadra AS v FROM players ORDER BY v").all()) as { v: string }[]).map(
    (r) => r.v
  );
  return { ruoli, squadre };
}
