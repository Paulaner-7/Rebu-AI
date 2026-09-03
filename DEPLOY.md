# Deploy Rebu AI su Vercel + Supabase (quando hai gli account)

Stato: app pronta (build prod verde, collaudo 200 acquisti OK). Manca solo questo.

## 1. Supabase (database)
1. Crea progetto su supabase.com → copia Project URL e service_role key.
2. SQL Editor → incolla `supabase/migrations/0001_rebu_schema.sql` poi `0002_nomina_corrente.sql` → Run.
3. Verifica tabelle create (managers, players, dataset_versions, ...).

## 2. Vercel (hosting)
1. `cd rebu-ai && git init` già fatto → pusha su GitHub (repo privata).
2. vercel.com → Add New Project → importa repo → framework Next.js (auto).
3. Environment Variables (Production): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `OPENCODE_API_KEY`, `REBU_ACCESS_CODE` (codice lungo a scelta), `REBU_SESSION_SECRET` (casuale).
4. Deploy → apri URL → login con codice → /api/health deve dire `"provider":"supabase"`.

## 3. Dati in produzione
Dopo deploy: da locale con `.env.local` puntato a Supabase? No — Fase attuale usa
SQLite locale. Migrazione dati listone→Supabase prevista prima dell'asta vera
(adapter già isolato in `src/lib/db.ts`). Chiedimi "migrazione Supabase" quando hai le chiavi.

## 4. Pre-asta (il giorno prima)
- Reimporta listone/guida freschi in `dati/` → `npm run import` → commit.
- Impostazioni: nomi 8, modificatore, modello AI.
- Prova export: simula 1 acquisto, concludi test, resetta, scarica CSV di prova.
