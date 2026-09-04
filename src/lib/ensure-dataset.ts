// Auto-import dataset all'apertura sito: se DB manca, vuoto o più vecchio
// di cartella dati/, lancia scripts/import-dataset.mjs (idempotente: esce
// subito se hash invariato). Mai lancia eccezioni: sito apre comunque.
import { spawnSync } from "node:child_process";
import { existsSync, statSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type EnsureResult = { ok: boolean; didImport: boolean; version?: string; log?: string };

const THROTTLE_MS = 30_000;
const LOCK_MAX_AGE_MS = 120_000;
let lastCheck = 0;
let lastResult: EnsureResult = { ok: false, didImport: false };

const REQUIRED = [
  "listone.xlsx",
  "guida_asta.xlsx",
  join("quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2022_23.xlsx"),
  join("quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2023_24.xlsx"),
  join("quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2024_25.xlsx"),
  join("quotazioni_storiche", "Quotazioni_Fantacalcio_Stagione_2025_26.xlsx"),
];

function mtime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function playerCount(dbPath: string): number {
  try {
    const c = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return (c.prepare("SELECT COUNT(*) AS n FROM players").get() as { n: number }).n;
    } finally {
      c.close();
    }
  } catch {
    return 0;
  }
}

function activeVersion(dbPath: string): string | undefined {
  try {
    const c = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const r = c.prepare("SELECT value FROM settings WHERE key='dataset_attivo'").get() as
        | { value: string }
        | undefined;
      return r?.value;
    } finally {
      c.close();
    }
  } catch {
    return undefined;
  }
}

export function ensureDataset(): EnsureResult {
  const now = Date.now();
  if (now - lastCheck < THROTTLE_MS) return lastResult;
  lastCheck = now;

  // Serverless (Vercel): niente cartella dati/ né FS persistente. Skip.
  if (process.env.VERCEL) {
    lastResult = { ok: false, didImport: false, log: "skip: ambiente serverless" };
    return lastResult;
  }

  const root = process.cwd();
  const dbPath = join(root, ".data", "rebu.db");
  const dati = join(root, "..", "dati");

  const missing = REQUIRED.filter((f) => !existsSync(join(dati, f)));
  if (missing.length > 0) {
    lastResult = { ok: false, didImport: false, log: `cartella dati/ incompleta, manca: ${missing.join(", ")}` };
    return lastResult;
  }

  const datiNewest = Math.max(...REQUIRED.map((f) => mtime(join(dati, f))));
  const dbMtime = mtime(dbPath);
  if (dbMtime > 0 && datiNewest <= dbMtime && playerCount(dbPath) > 0) {
    lastResult = { ok: true, didImport: false, version: activeVersion(dbPath) };
    return lastResult;
  }

  // Lock anti-corsa: due request parallele alla prima apertura.
  const lock = join(root, ".data", "rebu.import.lock");
  try {
    if (existsSync(lock)) {
      const raw = readFileSync(lock, "utf8").split("|");
      if (now - Number(raw[1] ?? 0) < LOCK_MAX_AGE_MS && raw[0] !== String(process.pid)) {
        lastResult = { ok: false, didImport: false, log: "import già in corso" };
        return lastResult;
      }
    }
    writeFileSync(lock, `${process.pid}|${now}`);
  } catch {
    /* lock best-effort */
  }

  try {
    const r = spawnSync("node", ["scripts/import-dataset.mjs"], {
      cwd: root,
      timeout: 120_000,
      encoding: "utf8",
      stdio: "pipe",
    });
    const out = `${r.stdout ?? ""}${r.error ? `\nERRORE: ${String(r.error)}` : ""}`.slice(-1500);
    const n = playerCount(dbPath);
    if (n > 0) {
      lastResult = { ok: true, didImport: true, version: activeVersion(dbPath), log: out };
    } else {
      lastResult = { ok: false, didImport: false, log: out || "import senza giocatori" };
    }
    return lastResult;
  } catch (e) {
    lastResult = { ok: false, didImport: false, log: String(e).slice(0, 500) };
    return lastResult;
  } finally {
    try {
      rmSync(lock, { force: true });
    } catch {
      /* lock best-effort */
    }
  }
}
