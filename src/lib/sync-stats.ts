import { createHash } from "node:crypto";
import type { Db } from "./pgdb";
// Fonti condivise con scripts/sync-stats.mjs (stesso fetch/parse/join).
// Scritture qui via Db astratto: funziona su SQLite locale e Supabase.
// updated_at passato da JS (ISO): portabile, niente datetime('now')/now().
import { fetchUnderstat, fetchFantacalcio, makeTrovaOfficialId, COLS } from "../../scripts/stats-sources.mjs";

export type SyncJob = { label: string; stato: "ok" | "idem" | "skip"; righe: number; joined: number; errore?: string };
export type SyncReport = { jobs: SyncJob[]; totale: number; dataset: string | null };

const SET_COLS = COLS.filter((c) => !["stagione", "fonte", "nome_norm", "squadra"].includes(c));

export async function syncStats(
  db: Db,
  opts?: { seasons?: string[]; source?: "all" | "understat" | "fantacalcio" }
): Promise<SyncReport> {
  const seasons = opts?.seasons?.length ? opts.seasons : ["2026-27"];
  const fonti = (opts?.source ?? "all") === "all" ? ["understat", "fantacalcio"] : [opts!.source!];
  const ds = (await db.prepare("SELECT value AS v FROM settings WHERE key='dataset_attivo'").get() as { v: string } | undefined)?.v ?? null;
  const attivi = ds
    ? (await db.prepare("SELECT official_id, nome_norm, squadra FROM players WHERE dataset_version=?").all(ds) as { official_id: number; nome_norm: string; squadra: string }[])
    : [];
  const trovaOfficialId = makeTrovaOfficialId(attivi);
  const upsert = `INSERT INTO player_stats (${[...COLS, "updated_at"].join(",")})
    VALUES (${[...COLS, "updated_at"].map(() => "?").join(",")})
    ON CONFLICT(stagione, fonte, nome_norm, squadra) DO UPDATE SET
    ${SET_COLS.map((c) => `${c}=excluded.${c}`).join(", ")}, updated_at=excluded.updated_at`;

  const jobs: SyncJob[] = [];
  let totale = 0;
  for (const stagione of seasons) {
    for (const fonte of fonti) {
      const label = `${fonte} ${stagione}`;
      let rows: Record<string, unknown>[];
      try {
        rows = fonte === "understat" ? await fetchUnderstat(stagione) : await fetchFantacalcio(stagione);
      } catch (e) {
        jobs.push({ label, stato: "skip", righe: 0, joined: 0, errore: e instanceof Error ? e.message : "fetch" });
        continue;
      }
      const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 16);
      const key = `stats_hash_${label.replace(/\W+/g, "_")}`;
      const cur = await db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
      if (cur?.value === hash) { jobs.push({ label, stato: "idem", righe: rows.length, joined: 0 }); continue; }
      const ts = new Date().toISOString();
      let joined = 0;
      for (const r0 of rows) {
        const r = { official_id: null, ...r0 } as Record<string, unknown>;
        if (r.official_id == null) r.official_id = trovaOfficialId(r);
        if (r.official_id != null) joined++;
        await db.prepare(upsert).run(...COLS.map((c) => r[c] ?? null), ts);
      }
      await db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, hash);
      totale += rows.length;
      jobs.push({ label, stato: "ok", righe: rows.length, joined });
    }
  }
  return { jobs, totale, dataset: ds };
}
