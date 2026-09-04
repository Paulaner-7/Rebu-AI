import Link from "next/link";
import { Search } from "lucide-react";
import { searchPlayers, getFilterOptions, isImported, getActiveVersion } from "@/lib/store";
import { searchPlayersSb, getFilterOptionsSb, isImportedSb, getActiveVersionSb, useSupabase } from "@/lib/store-sb";
import { writableDb, latestSessionId } from "@/lib/auction-store";
import { getState } from "@/lib/auction";
import { Eyebrow, Panel, RoleBadge, XIChip, btnPrimary } from "@/components/ui";
import Star from "./star";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ruolo?: string; squadra?: string }>;
}) {
  const { q = "", ruolo = "", squadra = "" } = await searchParams;
  const useSb = useSupabase();
  const imported = useSb ? await isImportedSb() : isImported();
  const { ruoli, squadre } = useSb ? await getFilterOptionsSb() : getFilterOptions();
  const rows = imported ? (useSb ? await searchPlayersSb(q, ruolo, squadra) : searchPlayers(q, ruolo, squadra)) : [];
  let pref = new Map<number, string>();
  try {
    const sid = latestSessionId();
    if (sid) {
      const ds = getState(writableDb(), sid).session.dataset;
      const pr = writableDb().prepare("SELECT official_id AS o, tipo FROM preferenze WHERE dataset_version=?").all(ds) as { o: number; tipo: string }[];
      pref = new Map(pr.map((r) => [r.o, r.tipo]));
    }
  } catch { /* db senza preferenze yet */ }

  return (
    <main className="flex flex-col gap-4">
      <header>
        <Eyebrow>Listone</Eyebrow>
        <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Giocatori</h1>
      </header>
      {!imported ? (
        <Panel>
          <p className="text-sm text-muted">
            Dataset non importato. Esegui <code className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-xs">npm run import</code> nella cartella rebu-ai.
          </p>
        </Panel>
      ) : (
        <>
          <p className="font-mono text-[11px] text-faint">Dataset {useSb ? await getActiveVersionSb() : getActiveVersion()} · sempre Nome + Squadra + Ruolo (anti-omonimi)</p>
          <form method="GET" className="flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                name="q"
                defaultValue={q}
                placeholder="Cerca nome o squadra"
                aria-label="Cerca nome o squadra"
                className="min-h-[48px] w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-base text-ink transition placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <select name="ruolo" defaultValue={ruolo} aria-label="Filtra per ruolo" className="min-h-[48px] flex-1 rounded-lg border border-line bg-panel px-2 text-base text-ink focus:border-signal/60 focus:outline-none">
                <option value="">Tutti i ruoli</option>
                {ruoli.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <select name="squadra" defaultValue={squadra} aria-label="Filtra per squadra" className="min-h-[48px] flex-1 rounded-lg border border-line bg-panel px-2 text-base text-ink focus:border-signal/60 focus:outline-none">
                <option value="">Tutte le squadre</option>
                {squadre.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button type="submit" className={btnPrimary}>Cerca</button>
          </form>
          <p className="font-mono text-xs text-muted"><span className="tnum">{rows.length}</span> risultati</p>
          <div className="overflow-hidden rounded-xl border border-line bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">Giocatore</th>
                  <th className="px-2 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">Qt.</th>
                  <th className="px-2 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">FVM</th>
                  <th className="px-3 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint">PMA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.official_id} className="border-b border-line/60 transition last:border-0 hover:bg-panel2/60">
                    <td className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={`/giocatori/${p.official_id}`} className="font-bold underline-offset-4 transition hover:text-signal hover:underline">
                              <b>{p.nome}</b>
                            </Link>
                            <span className="text-muted">· {p.squadra}</span>
                            <RoleBadge r={p.ruolo_classic} />
                            {p.is_titolare ? <XIChip /> : null}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-faint">{p.ruolo_mantra}</div>
                        </div>
                        <Star officialId={p.official_id} stato={(pref.get(p.official_id) as "W" | "X") ?? null} />
                      </div>
                    </td>
                    <td className="tnum px-2 text-right font-mono">{p.qt_a ?? "—"}</td>
                    <td className="tnum px-2 text-right font-mono text-muted">{p.fvm ?? "—"}</td>
                    <td className="tnum px-3 text-right font-mono text-muted">{p.pma ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
