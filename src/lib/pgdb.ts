// Adapter DB unico: stesso codice motore su SQLite (locale) e Postgres (prod).
// - SQLite: node:sqlite sincrono, wrappato in Promise (await su valori ok).
// - Postgres: driver `postgres` su pooler Supabase, `?` -> `$n`, tipi normalizzati.
// Transazioni: BEGIN/COMMIT/ROLLBACK via exec riservano una connessione PG.
import { DatabaseSync } from "node:sqlite";
import postgres, { type Sql } from "postgres";

export type DbKind = "sqlite" | "pg";
export interface Stmt {
  get(...params: unknown[]): Promise<unknown>;
  all(...params: unknown[]): Promise<unknown[]>;
  run(...params: unknown[]): Promise<{ lastInsertRowid: unknown; changes: unknown }>;
}
export interface Db {
  kind: DbKind;
  prepare(sql: string): Stmt;
  exec(sql: string): Promise<void>;
  // Handle interno se wrapper (cachedDb): chiave stabile per memo per-processo.
  inner?: Db;
}

export function usePostgres(): boolean {
  return (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "").length > 0;
}

// --- normalizzazione valori PG -> forme attese dal motore ---
function normValue(v: unknown): unknown {
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v !== null && typeof v === "object" && !Buffer.isBuffer(v) && !(v instanceof Date)) {
    try { return JSON.stringify(v); } catch { return v; }
  }
  if (typeof v === "string" && /^-?(0|[1-9]\d{0,14})$/.test(v)) return Number(v);
  return v;
}
function normRow<T>(r: T): T {
  if (Array.isArray(r)) return r.map(normRow) as unknown as T;
  if (r !== null && typeof r === "object" && !Buffer.isBuffer(r) && !(r instanceof Date)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) o[k] = normValue(v);
    return o as T;
  }
  return normValue(r) as T;
}

// --- SQLite ---
function sqliteDb(db: DatabaseSync): Db {
  const bind = (p: unknown[]) => p.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
  const wrap = (sql: string) => {
    const st = db.prepare(sql);
    return {
      get: async (...p: unknown[]) => normRow(st.get(...(bind(p) as never[]))),
      all: async (...p: unknown[]) => normRow(st.all(...(bind(p) as never[])) as unknown[]),
      run: async (...p: unknown[]) => {
        const r = st.run(...(bind(p) as never[]));
        return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
      },
    };
  };
  return { kind: "sqlite", prepare: wrap, exec: async (sql) => { db.exec(sql); } };
}

// --- Postgres ---
const INSERT_ID_TABLES = new Set(["auction_events", "auction_sessions", "purchases", "managers", "agent_runs"]);

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

let pgClient: Sql | null = null;
function pgConn(): Sql {
  if (!pgClient) {
    const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
    pgClient = postgres(url, { prepare: false, max: 8, idle_timeout: 10, connect_timeout: 8 });
  }
  return pgClient;
}

function pgDb(): Db {
  const sql = pgConn();
  let tx: Awaited<ReturnType<Sql["reserve"]>> | null = null;
  const conn = () => tx ?? sql;
  const runQuery = async (qsql: string, params: unknown[]) => conn().unsafe(toPg(qsql), params as never[]);
  return {
    kind: "pg",
    prepare(qsql: string): Stmt {
      let finalSql = qsql;
      const m = /^\s*insert\s+into\s+([a-z_]+)/i.exec(qsql);
      const needId = m && INSERT_ID_TABLES.has(m[1]!.toLowerCase()) && !/returning\s/i.test(qsql);
      if (needId) finalSql = `${qsql} RETURNING id`;
      return {
        get: async (...p) => normRow((await runQuery(finalSql, p))[0]),
        all: async (...p) => normRow([...(await runQuery(finalSql, p))]),
        run: async (...p) => {
          const rows = await runQuery(finalSql, p);
          const first = (rows as unknown[])[0] as { id?: unknown } | undefined;
          return { lastInsertRowid: first?.id, changes: rows.count };
        },
      };
    },
    exec: async (qsql: string) => {
      const t = qsql.trim().toUpperCase();
      if (t === "BEGIN") { if (!tx) tx = await sql.reserve(); return; }
      if (t === "COMMIT" || t === "ROLLBACK") {
        if (!tx) return;
        try { await tx.unsafe(t); } finally { tx.release(); tx = null; }
        return;
      }
      // no-op mirati SQLite
      if (/SQLITE_SEQUENCE/i.test(qsql)) return;
      for (const part of qsql.split(";")) {
        const s = part.trim();
        if (s) await conn().unsafe(toPg(s));
      }
    },
  };
}

// Wrapper per-request: memoizza letture (SELECT/PRAGMA/WITH) identiche nella
// stessa richiesta. Si svuota a ogni scrittura (run/exec). Pagina asta passa
// da ~60 a ~20 roundtrip: managerStates/inflazioneAsta/settings erano ripetute.
// Va creato fresco a ogni request (stato asta cambia tra richieste).
export function cachedDb(inner: Db): Db {
  const cache = new Map<string, Promise<unknown>>();
  const isRead = (sql: string) => /^\s*(select|pragma|with)\b/i.test(sql);
  const key = (kind: string, sql: string, p: unknown[]) => kind + "\n" + sql + "\n" + JSON.stringify(p ?? []);
  return {
    kind: inner.kind,
    inner,
    prepare(sql: string): Stmt {
      const st = inner.prepare(sql);
      if (!isRead(sql)) return st;
      return {
        get: (...p) => {
          const k = key("g", sql, p);
          let pr = cache.get(k);
          if (!pr) { pr = st.get(...p); cache.set(k, pr); }
          return pr as ReturnType<Stmt["get"]>;
        },
        all: (...p) => {
          const k = key("a", sql, p);
          let pr = cache.get(k);
          if (!pr) { pr = st.all(...p); cache.set(k, pr); }
          return pr as ReturnType<Stmt["all"]>;
        },
        run: (...p) => st.run(...p),
      };
    },
    exec: async (sql) => { cache.clear(); await inner.exec(sql); },
  };
}

// Frammento estrazione JSON payload per tipo evento/giocatore.
export function jext(db: Db, field: string): string {
  return db.kind === "pg" ? `(payload->>'${field}')::bigint` : `json_extract(payload,'$.${field}')`;
}

// Costruisce handle: PG se DATABASE_URL/POSTGRES_URL, altrimenti SQLite locale.
export function makeDb(sqlite?: DatabaseSync | null): Db {
  if (usePostgres()) return pgDb();
  if (!sqlite) throw new Error("SQLite non inizializzato");
  return sqliteDb(sqlite);
}
