-- Rebu AI 0005: una sola asta aperta alla volta (sicurezza concorrenza serverless).
-- Due setup simultanei: il secondo fallisce con unique violation -> codice ASTA_APERTA.
create unique index if not exists one_open_auction
  on auction_sessions ((case when stato in ('BOZZA','PRONTA','LIVE','PAUSA') then 1 else null end));
