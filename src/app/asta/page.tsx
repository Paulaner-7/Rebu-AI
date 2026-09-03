import { publicState, defaultManagers } from "@/lib/auction-store";
import Console from "./console";

export default function Page() {
  const { sid, state } = publicState();
  const defaults = defaultManagers();
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Asta</h1>
      {state === null ? (
        <p className="text-sm opacity-70">Nessuna asta. Compila nomi e prepara.</p>
      ) : (
        <section className="rounded border bg-white p-3 text-sm">
          <p>Stato: <b>{state.session.stato}</b> · dataset: <b>{state.session.dataset || "—"}</b> · v{state.session.versione} · eventi {state.eventi} · acquisti {state.acquisti}</p>
          {state.nomination && (
            <p className="mt-1">Nominato: <b>{state.nomination.nome}</b> · {state.nomination.squadra} · {state.nomination.ruolo}</p>
          )}
        </section>
      )}
      <Console
        sid={sid}
        versione={state?.session.versione ?? 0}
        stato={state?.session.stato ?? ""}
        managers={(state?.managers ?? []).map((m) => ({ id: m.id, nome: m.nome }))}
        defaults={defaults}
      />
      {state !== null && (
        <section className="flex flex-col gap-2">
          {state.managers.map((m) => (
            <details key={m.id} className="rounded border bg-white p-3 text-sm">
              <summary><b>{m.nome}</b> {m.nome_squadra && `(${m.nome_squadra})`} · residui <b>{m.residui}</b> · max <b>{m.maxSpesa}</b> · P{m.slot.P.usati}/{m.slot.P.totali} D{m.slot.D.usati}/{m.slot.D.totali} C{m.slot.C.usati}/{m.slot.C.totali} A{m.slot.A.usati}/{m.slot.A.totali}</summary>
              <ul className="mt-2">
                {m.rosa.map((g, i) => (
                  <li key={i}>{g.nome} · {g.squadra} · {g.ruolo} · {g.prezzo}</li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
