import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { ensureExtras, getState } from "./auction";
import { ensureDataset } from "./ensure-dataset";
import { makeDb, usePostgres, type Db } from "./pgdb";

// Locale: SQLite in .data (persistente). Vercel: Postgres via DATABASE_URL.
// Sul serverless /tmp è effimero: MAI più sqlite in prod (dati persi tra istanze).
const DB_PATH = join(process.cwd(), ".data", "rebu.db");

let sqlite: DatabaseSync | null = null;
let handle: Db | null = null;

function sqliteConn(): DatabaseSync {
  if (!sqlite) {
    ensureDataset(); // DB auto-pronto aprendo sito (idempotente, throttled)
    mkdirSync(dirname(DB_PATH), { recursive: true });
    sqlite = new DatabaseSync(DB_PATH);
    sqlite.exec("PRAGMA journal_mode = WAL");
    sqlite.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
  }
  return sqlite;
}

export function writableDb(): Db {
  if (!handle) handle = makeDb(usePostgres() ? null : sqliteConn());
  return handle;
}

async function boot(): Promise<Db> {
  const db = writableDb();
  if (db.kind === "sqlite") ensureDataset();
  await ensureExtras(db);
  return db;
}

// Nomi default: in prod da tabella managers, in locale da dati/avversari.csv.
export async function defaultManagers(): Promise<{ nome: string; nome_squadra: string; note: string }[]> {
  const fallback = () => {
    try {
      const csv = readFileSync(join(process.cwd(), "..", "dati", "avversari.csv"), "utf8");
      const rows = csv.split("\n").slice(1).map((l) => l.split(",")).filter((p) => p[0]?.trim())
        .map((p) => ({ nome: p[0].trim(), nome_squadra: (p[1] || "").trim(), note: (p[2] || "").trim() }));
      if (rows.length === 8) return rows;
    } catch { /* sotto */ }
    return Array.from({ length: 8 }, (_, i) => ({ nome: `Squadra ${i + 1}`, nome_squadra: "", note: "" }));
  };
  if (!usePostgres()) return fallback();
  try {
    const { getSupabaseServer } = await import("./db");
    const sb = getSupabaseServer();
    if (!sb) return fallback();
    const { data } = await sb.from("managers").select("nome,nome_squadra,note").order("id").limit(8);
    if (data && data.length === 8) {
      return (data as { nome: string; nome_squadra: string; note: string }[])
        .map((m) => ({ nome: m.nome, nome_squadra: m.nome_squadra ?? "", note: m.note ?? "" }));
    }
  } catch { /* fallback */ }
  return fallback();
}

export async function latestSessionId(): Promise<number | null> {
  const db = await boot();
  const r = (await db.prepare("SELECT id FROM auction_sessions ORDER BY id DESC LIMIT 1").get()) as { id: number } | undefined;
  return r?.id ?? null;
}

export async function publicState() {
  const sid = await latestSessionId();
  if (!sid) return { session: null as null | { id: number }, sid: null as number | null, state: null };
  return { session: { id: sid }, sid, state: await getState(writableDb(), sid) };
}
