-- Rebu AI — schema Postgres (Supabase). Fase 8: applicare con `supabase db push`.
-- Lega: 8 partecipanti, 500 crediti, rosa 3P/8D/8C/6A, Classic, asta per reparti.

create table if not exists dataset_versions (
  id bigserial primary key,
  version text unique not null,
  created_at timestamptz default now(),
  source_hash text not null,
  counts jsonb default '{}',
  report jsonb default '{}'
);

create table if not exists squads (
  id bigserial primary key,
  dataset_version text not null references dataset_versions(version),
  squadra text not null,
  sigla text not null,
  modulo text not null,
  allenatore text not null
);

create table if not exists players (
  id bigserial primary key,
  dataset_version text not null references dataset_versions(version),
  official_id integer not null,
  nome text not null,
  nome_norm text not null,
  squadra text not null,
  ruolo_classic text not null check (ruolo_classic in ('P','D','C','A')),
  ruolo_mantra text not null default '',
  qt_a integer,
  qt_i integer,
  fvm integer,
  is_titolare boolean default false,
  ballottaggio text default '',
  rigorista_ord integer,
  punizioni_ord integer,
  pma numeric, -- assente nei PDF 26/27: resta NULL finché non arriva fonte con PMA
  qt_2223 integer,
  qt_2324 integer,
  qt_2425 integer,
  qt_2526 integer,
  unique (dataset_version, official_id),
  unique (dataset_version, nome_norm, squadra)
);
create index if not exists players_search_idx on players (dataset_version, ruolo_classic, squadra);

create table if not exists ballottaggi (
  id bigserial primary key,
  dataset_version text not null references dataset_versions(version),
  squadra text not null,
  giocatore1 text not null,
  giocatore2 text not null
);

create table if not exists piazzati (
  id bigserial primary key,
  dataset_version text not null references dataset_versions(version),
  squadra text not null,
  tipo text not null check (tipo in ('Rigori','Punizioni')),
  ordine integer not null,
  giocatore text not null
);

create table if not exists griglia_portieri (
  dataset_version text not null references dataset_versions(version),
  s1 text not null, s2 text not null, valore integer not null,
  primary key (dataset_version, s1, s2)
);

create table if not exists managers (
  id bigserial primary key,
  nome text not null,
  nome_squadra text not null default '',
  note text default '',
  is_owner boolean default false,
  crediti_iniziali integer default 500
);

create table if not exists settings (
  key text primary key,
  value text not null
);
-- Seed lega (idempotente): eseguire dopo migrate
-- insert into settings(key,value) values
--  ('crediti','500'),('rosa_P','3'),('rosa_D','8'),('rosa_C','8'),('rosa_A','6'),
--  ('modo','classic'),('modificatore_default','on'),('ordine_reparti','P,D,C,A')
-- on conflict (key) do update set value = excluded.value;

create table if not exists auction_sessions (
  id bigserial primary key,
  dataset_version text not null references dataset_versions(version),
  stato text not null default 'DRAFT',
  reparto_corrente text,
  state_version integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists auction_events (
  id bigserial primary key,
  session_id bigint not null references auction_sessions(id),
  seq integer not null,
  tipo text not null,
  payload jsonb default '{}',
  idempotency_key text,
  compensates_id bigint references auction_events(id),
  created_at timestamptz default now(),
  unique (session_id, seq),
  unique (idempotency_key)
);

create table if not exists purchases (
  id bigserial primary key,
  session_id bigint not null references auction_sessions(id),
  player_id bigint not null references players(id),
  manager_id bigint not null references managers(id),
  prezzo integer not null check (prezzo >= 1),
  source_event_id bigint not null references auction_events(id),
  unique (session_id, player_id)
);

create table if not exists agent_runs (
  id bigserial primary key,
  session_id bigint references auction_sessions(id),
  domanda text not null,
  tool_calls jsonb default '[]',
  output jsonb default '{}',
  state_version integer,
  latenza_ms integer,
  created_at timestamptz default now()
);

create table if not exists strategy_notes (
  id bigserial primary key,
  testo text not null,
  created_at timestamptz default now()
);
