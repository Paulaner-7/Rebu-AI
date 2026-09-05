-- Rebu pulsante (Fase 6): verdetti storicizzati per confronto in pagina Rose.
alter table if exists agent_runs add column if not exists official_id integer;
alter table if exists agent_runs add column if not exists verdetto text;
create index if not exists agent_runs_verdetto_idx on agent_runs (session_id, official_id);
