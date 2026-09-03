-- Rebu AI 0002: nomina corrente su sessione (specchio SQLite in schema.sqlite.sql)
alter table auction_sessions add column if not exists current_nomination integer;
