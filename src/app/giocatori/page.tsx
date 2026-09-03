import { searchPlayers, getFilterOptions, isImported, getActiveVersion } from "@/lib/store";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ruolo?: string; squadra?: string }>;
}) {
  const { q = "", ruolo = "", squadra = "" } = await searchParams;
  const imported = isImported();
  const { ruoli, squadre } = getFilterOptions();
  const rows = imported ? searchPlayers(q, ruolo, squadra) : [];

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Giocatori</h1>
      {!imported ? (
        <p className="text-sm">
          Dataset non importato. Esegui <code>npm run import</code> nella cartella rebu-ai.
        </p>
      ) : (
        <>
          <p className="text-xs opacity-60">Dataset {getActiveVersion()} · sempre Nome + Squadra + Ruolo (anti-omonimi)</p>
          <form method="GET" className="flex flex-col gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Cerca nome o squadra"
              className="min-h-[44px] rounded border px-3 text-base"
            />
            <div className="flex gap-2">
              <select name="ruolo" defaultValue={ruolo} className="min-h-[44px] flex-1 rounded border px-2 text-base">
                <option value="">Tutti i ruoli</option>
                {ruoli.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <select name="squadra" defaultValue={squadra} className="min-h-[44px] flex-1 rounded border px-2 text-base">
                <option value="">Tutte le squadre</option>
                {squadre.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="min-h-[44px] rounded bg-black font-semibold text-white">
              Cerca
            </button>
          </form>
          <p className="text-sm opacity-70">{rows.length} risultati</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Giocatore</th>
                <th className="text-right">Qt.</th>
                <th className="text-right">FVM</th>
                <th className="text-right">PMA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.official_id} className="border-b">
                  <td className="py-2">
                    <b>{p.nome}</b> <span className="opacity-60">· {p.squadra} · {p.ruolo_classic}</span>
                    {p.is_titolare ? <span className="ml-1 rounded bg-green-100 px-1 text-xs">XI</span> : null}
                    <div className="text-xs opacity-50">{p.ruolo_mantra}</div>
                  </td>
                  <td className="text-right">{p.qt_a ?? "—"}</td>
                  <td className="text-right">{p.fvm ?? "—"}</td>
                  <td className="text-right">{p.pma ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
