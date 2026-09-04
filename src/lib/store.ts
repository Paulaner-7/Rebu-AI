import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { ensureDataset } from "./ensure-dataset";

const DB_PATH = join(process.cwd(), ".data", "rebu.db");

let db: DatabaseSync | null = null;
function conn(): DatabaseSync | null {
  ensureDataset(); // DB auto-pronto aprendo sito (idempotente, throttled)
  if (db) return db;
  try {
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    return db;
  } catch {
    return null; // DB non ancora importato: pagina mostra guida
  }
}

export function isImported(): boolean {
  const c = conn();
  if (!c) return false;
  try {
    return (c.prepare("SELECT COUNT(*) AS n FROM players").get() as { n: number }).n > 0;
  } catch {
    return false;
  }
}

export function getActiveVersion(): string | null {
  const c = conn();
  if (!c) return null;
  try {
    const r = c.prepare("SELECT value FROM settings WHERE key='dataset_attivo'").get() as
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

export function searchPlayers(q: string, ruolo: string, squadra: string): PlayerRow[] {
  const c = conn();
  if (!c) return [];
  const like = `%${q.toLowerCase()}%`;
  return c
    .prepare(
      `SELECT official_id, nome, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, pma, is_titolare
       FROM players
       WHERE (lower(nome) LIKE ? OR lower(squadra) LIKE ?)
         AND (? = '' OR ruolo_classic = ?)
         AND (? = '' OR squadra = ?)
       ORDER BY qt_a DESC LIMIT 200`
    )
    .all(like, like, ruolo, ruolo, squadra, squadra) as PlayerRow[];
}

export type DatasetInfo = {
  version: string;
  totale: number;
  perRuolo: { P: number; D: number; C: number; A: number };
  squadre: number;
  titolari: number;
};

// Conteggi reali dal DB (auto-importato). Null se DB assente.
export function getDatasetInfo(): DatasetInfo | null {
  const c = conn();
  if (!c) return null;
  try {
    const version = getActiveVersion();
    if (!version) return null;
    const totale = (c.prepare("SELECT COUNT(*) AS n FROM players WHERE dataset_version=?").get(version) as { n: number }).n;
    if (!totale) return null;
    const perRuolo = { P: 0, D: 0, C: 0, A: 0 };
    for (const r of c.prepare("SELECT ruolo_classic AS ruolo, COUNT(*) AS n FROM players WHERE dataset_version=? GROUP BY ruolo_classic").all(version) as { ruolo: string; n: number }[]) {
      if (r.ruolo in perRuolo) perRuolo[r.ruolo as keyof typeof perRuolo] = r.n;
    }
    const squadre = (c.prepare("SELECT COUNT(DISTINCT squadra) AS n FROM players WHERE dataset_version=?").get(version) as { n: number }).n;
    const titolari = (c.prepare("SELECT COUNT(*) AS n FROM players WHERE dataset_version=? AND is_titolare=1").get(version) as { n: number }).n;
    return { version, totale, perRuolo, squadre, titolari };
  } catch {
    return null;
  }
}

export function getFilterOptions(): { ruoli: string[]; squadre: string[] } {
  const c = conn();
  if (!c) return { ruoli: [], squadre: [] };
  const ruoli = (c.prepare("SELECT DISTINCT ruolo_classic AS v FROM players ORDER BY v").all() as { v: string }[]).map(
    (r) => r.v
  );
  const squadre = (c.prepare("SELECT DISTINCT squadra AS v FROM players ORDER BY v").all() as { v: string }[]).map(
    (r) => r.v
  );
  return { ruoli, squadre };
}
