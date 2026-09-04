-- Rebu AI — 0004: statistiche giocatori multi-stagione (Postgres/Supabase).
-- Due fonti per stagione: 'fantacalcio' (voti e bonus ufficiali) e 'understat' (xG/xA).
-- Join col listone via official_id quando possibile, altrimenti (nome_norm, squadra).
create table if not exists player_stats (
  id bigserial primary key,
  stagione text not null check (stagione ~ '^\d{4}-\d{2}$'),   -- '2022-23' ... '2026-27'
  fonte text not null check (fonte in ('understat','fantacalcio')),
  official_id integer,                    -- NULL se non joinabile al dataset attivo
  nome text not null,
  nome_norm text not null,
  squadra text not null,
  ruolo text default '',                  -- ruolo registrato dalla fonte in quella stagione
  presenze integer,
  minuti integer,
  gol integer,
  assist integer,
  xg numeric,
  xa numeric,
  npxg numeric,
  tiri integer,
  passaggi_chiave integer,
  ammonizioni integer,
  espulsioni integer,
  rigori_segnati integer,
  rigori_sbagliati integer,
  rigori_parati integer,
  media_voto numeric,
  fantamedia numeric,
  gol_subiti integer,
  updated_at timestamptz default now(),
  unique (stagione, fonte, nome_norm, squadra)
);
create index if not exists player_stats_lookup_idx on player_stats (official_id, stagione);
create index if not exists player_stats_metriche_idx on player_stats (stagione, fonte, ruolo);

-- strategy_notes esiste già da 0001: nessuna modifica strutturale.
-- La KB strategica viene caricata in strategy_notes da scripts/import-kb.mjs
-- (una riga per blocco, testo con prefisso [KB-ID]).
