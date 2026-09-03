import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "node:path";
import { readFileSync, mkdirSync } from "node:fs";
import { ensureExtras, getState } from "./auction";

const DB_PATH = join(process.cwd(), ".data", "rebu.db");

let db: DatabaseSync | null = null;

export function writableDb(): DatabaseSync {
  if (!db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
    ensureExtras(db);
  }
  return db;
}

// Nomi default da dati/avversari.csv (compilabili sul posto in UI)
export function defaultManagers(): { nome: string; nome_squadra: string; note: string }[] {
  try {
    const csv = readFileSync(join(process.cwd(), "..", "dati", "avversari.csv"), "utf8");
    return csv
      .split("\n")
      .slice(1)
      .map((l) => l.split(","))
      .filter((p) => p[0]?.trim())
      .map((p) => ({ nome: p[0].trim(), nome_squadra: (p[1] || "").trim(), note: (p[2] || "").trim() }));
  } catch {
    return Array.from({ length: 8 }, (_, i) => ({ nome: `Squadra ${i + 1}`, nome_squadra: "", note: "" }));
  }
}

export function latestSessionId(): number | null {
  const d = writableDb();
  const r = d.prepare("SELECT id FROM auction_sessions ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
  return r?.id ?? null;
}

export function publicState() {
  const sid = latestSessionId();
  if (!sid) return { session: null as null | { id: number }, sid: null as number | null, state: null };
  return { session: { id: sid }, sid, state: getState(writableDb(), sid) };
}
