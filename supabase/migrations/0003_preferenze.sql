-- Rebu AI 0003: preferenze pupilli (W) / esclusi (X)
create table if not exists preferenze (
  dataset_version text not null references dataset_versions(version),
  official_id integer not null,
  tipo text not null check (tipo in ('W','X')),
  nota text default '',
  primary key (dataset_version, official_id)
);
