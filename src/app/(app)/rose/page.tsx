import { publicState, writableDb, defaultManagers } from "@/lib/auction-store";
import { cachedDb } from "@/lib/pgdb";
import { ChevronDown, Shirt } from "lucide-react";
import { EmptyState, Eyebrow, Panel, RoleBadge, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

const RUOLI = ["P", "D", "C", "A"] as const;
const TOTALE_ROSA = 25;

export default async function Page() {
  const { sid, state } = await publicState(cachedDb(writableDb()));
  if (sid === null || state === null) {
    return (
      <main className="flex flex-col gap-4">
        <header>
          <Eyebrow>Squadre</Eyebrow>
          <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Rose</h1>
        </header>
        <EmptyState
          icon={Shirt}
          title="Nessuna asta"
          body={`Prepara asta da pagina Asta (partecipanti default: ${(await defaultManagers()).map((m) => m.nome).join(", ")}). Rose appaiono qui a ogni STOP.`}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <header>
        <Eyebrow>Squadre · {state.acquisti} acquisti</Eyebrow>
        <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Rose</h1>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.managers.map((m) => {
          const fatti = m.rosa.length;
          return (
            <Panel key={m.id} className={cx(m.is_owner === 1 && "border-signal/40")}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate font-bold">
                  {m.nome}
                  {m.is_owner === 1 && <span className="ml-2 font-mono text-[10px] uppercase text-signal">tu</span>}
                </p>
                <p className="tnum shrink-0 font-mono text-lg font-semibold text-signal">{m.residui} <span className="text-xs font-normal text-faint">cr</span></p>
              </div>
              <div className="mt-1 flex items-center gap-3 font-mono text-[11px] text-muted">
                <span className="tnum">speso {m.speso}</span>
                <span className="tnum">max {m.maxSpesa}</span>
                <span className="tnum ml-auto">{fatti}/{TOTALE_ROSA}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2">
                <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${Math.round((fatti / TOTALE_ROSA) * 100)}%` }} />
              </div>
              <div className="mt-2 flex gap-2 font-mono text-[11px]">
                {RUOLI.map((r) => (
                  <span key={r} className="tnum rounded border border-line bg-panel2 px-1.5 py-0.5 text-muted">
                    <b className={cx({ P: "text-p", D: "text-d", C: "text-c", A: "text-a" }[r])}>{r}</b>{" "}
                    {m.slot[r].usati}/{m.slot[r].totali}
                  </span>
                ))}
              </div>
              <details className="group mt-2">
                <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1 font-mono text-xs text-muted [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 transition [details[open]_&]:rotate-180" aria-hidden />
                  {fatti === 0 ? "Rosa vuota" : `Vedi ${fatti} giocatori`}
                </summary>
                <ul className="border-t border-line pt-1">
                  {m.rosa.map((g, i) => (
                    <li key={i} className="flex items-center gap-2 border-b border-line/50 py-1.5 text-sm last:border-0">
                      <RoleBadge r={g.ruolo} />
                      <span className="min-w-0 flex-1 truncate">{g.nome} <span className="text-faint">· {g.squadra}</span></span>
                      <span className="tnum font-mono text-muted">{g.prezzo}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Panel>
          );
        })}
      </div>
    </main>
  );
}
