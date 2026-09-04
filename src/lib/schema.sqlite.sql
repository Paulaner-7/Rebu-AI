-- Rebu AI — schema SQLite locale (dev/test Fase 1-7). Mirror di supabase/migrations/0001.
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS dataset_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  source_hash TEXT NOT NULL,
  counts TEXT DEFAULT '{}',
  report TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS squads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  squadra TEXT NOT NULL, sigla TEXT NOT NULL, modulo TEXT NOT NULL, allenatore TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  official_id INTEGER NOT NULL,
  nome TEXT NOT NULL, nome_norm TEXT NOT NULL, squadra TEXT NOT NULL,
  ruolo_classic TEXT NOT NULL CHECK (ruolo_classic IN ('P','D','C','A')),
  ruolo_mantra TEXT NOT NULL DEFAULT '',
  qt_a INTEGER, qt_i INTEGER, fvm INTEGER,
  is_titolare INTEGER DEFAULT 0,
  ballottaggio TEXT DEFAULT '',
  rigorista_ord INTEGER, punizioni_ord INTEGER,
  pma REAL,
  qt_2223 INTEGER, qt_2324 INTEGER, qt_2425 INTEGER, qt_2526 INTEGER,
  UNIQUE (dataset_version, official_id),
  UNIQUE (dataset_version, nome_norm, squadra)
);
CREATE INDEX IF NOT EXISTS players_search_idx ON players (dataset_version, ruolo_classic, squadra);
CREATE TABLE IF NOT EXISTS ballottaggi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  squadra TEXT NOT NULL, giocatore1 TEXT NOT NULL, giocatore2 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS piazzati (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  squadra TEXT NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('Rigori','Punizioni')),
  ordine INTEGER NOT NULL, giocatore TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS griglia_portieri (
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  s1 TEXT NOT NULL, s2 TEXT NOT NULL, valore INTEGER NOT NULL,
  PRIMARY KEY (dataset_version, s1, s2)
);
CREATE TABLE IF NOT EXISTS managers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL, nome_squadra TEXT NOT NULL DEFAULT '', note TEXT DEFAULT '',
  is_owner INTEGER DEFAULT 0, crediti_iniziali INTEGER DEFAULT 500
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auction_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  stato TEXT NOT NULL DEFAULT 'DRAFT', reparto_corrente TEXT,
  current_nomination INTEGER,
  state_version INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auction_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES auction_sessions(id),
  seq INTEGER NOT NULL, tipo TEXT NOT NULL, payload TEXT DEFAULT '{}',
  idempotency_key TEXT, compensates_id INTEGER REFERENCES auction_events(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (session_id, seq), UNIQUE (idempotency_key)
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES auction_sessions(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  manager_id INTEGER NOT NULL REFERENCES managers(id),
  prezzo INTEGER NOT NULL CHECK (prezzo >= 1),
  source_event_id INTEGER NOT NULL REFERENCES auction_events(id),
  UNIQUE (session_id, player_id)
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES auction_sessions(id),
  domanda TEXT NOT NULL, tool_calls TEXT DEFAULT '[]', output TEXT DEFAULT '{}',
  state_version INTEGER, latenza_ms INTEGER, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS strategy_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testo TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS preferenze (
  dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
  official_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('W','X')),
  nota TEXT DEFAULT '',
  PRIMARY KEY (dataset_version, official_id)
);
-- Rebu AI — 0004 (SQLite locale): statistiche giocatori multi-stagione.
-- Da accodare a src/lib/schema.sqlite.sql (oppure applicare con sqlite3 .read).
CREATE TABLE IF NOT EXISTS player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stagione TEXT NOT NULL,                 -- '2022-23' ... '2026-27'
  fonte TEXT NOT NULL CHECK (fonte IN ('understat','fantacalcio')),
  official_id INTEGER,                    -- NULL se non joinabile al dataset attivo
  nome TEXT NOT NULL,
  nome_norm TEXT NOT NULL,
  squadra TEXT NOT NULL,
  ruolo TEXT DEFAULT '',
  presenze INTEGER,
  minuti INTEGER,
  gol INTEGER,
  assist INTEGER,
  xg REAL,
  xa REAL,
  npxg REAL,
  tiri INTEGER,
  passaggi_chiave INTEGER,
  ammonizioni INTEGER,
  espulsioni INTEGER,
  rigori_segnati INTEGER,
  rigori_sbagliati INTEGER,
  rigori_parati INTEGER,
  media_voto REAL,
  fantamedia REAL,
  gol_subiti INTEGER,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (stagione, fonte, nome_norm, squadra)
);
CREATE INDEX IF NOT EXISTS player_stats_lookup_idx ON player_stats (official_id, stagione);
CREATE INDEX IF NOT EXISTS player_stats_metriche_idx ON player_stats (stagione, fonte, ruolo);
