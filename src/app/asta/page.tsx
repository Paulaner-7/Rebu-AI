import { publicState, writableDb } from "@/lib/auction-store";
import { defaultManagers } from "@/lib/auction-store";
import { prezzoRiferimento, tettoConsigliato, inflazioneAsta, prossimeChiamate } from "@/lib/pricing";
import Console from "./console";
import Live from "./live";

export default function Page() {
  const { sid, state } = publicState();
  if (sid === null || state === null) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Asta</h1>
        <p className="text-sm opacity-70">Nessuna asta. Compila nomi e prepara.</p>
        <Console sid={null} versione={0} stato="" managers={[]} defaults={defaultManagers()} />
      </main>
    );
  }
  const db = writableDb();
  const owner = state.managers.find((m) => m.is_owner === 1) ?? state.managers[0];
  const infl = inflazioneAsta(db, sid);
  const next = owner ? prossimeChiamate(db, sid, owner.id, 3) : null;
  const consiglio = state.nomination && owner ? {
    rif: prezzoRiferimento(db, state.session.dataset, state.nomination.o),
    tetto: tettoConsigliato(db, sid, owner.id, state.nomination.o),
  } : null;
  const topPagati = db.prepare(
    `SELECT pl.nome, pl.squadra, m.nome AS chi, pu.prezzo AS prezzo
     FROM purchases pu JOIN players pl ON pl.id=pu.player_id JOIN managers m ON m.id=pu.manager_id
     WHERE pu.session_id=? ORDER BY pu.prezzo DESC LIMIT 10`
  ).all(sid) as { nome: string; squadra: string; chi: string; prezzo: number }[];
  const affari = db.prepare(
    `SELECT pl.nome, pl.squadra, m.nome AS chi, pu.prezzo AS prezzo, CAST(pl.fvm/2 AS INT) AS rif
     FROM purchases pu JOIN players pl ON pl.id=pu.player_id JOIN managers m ON m.id=pu.manager_id
     WHERE pu.session_id=? AND pl.fvm IS NOT NULL ORDER BY (pl.fvm/2 - pu.prezzo) DESC LIMIT 10`
  ).all(sid) as { nome: string; squadra: string; chi: string; prezzo: number; rif: number }[];

  return (
    <main className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Asta <span className="text-sm font-normal opacity-60">{state.session.stato} · v{state.session.versione}</span></h1>
      <Live
        sid={sid} versione={state.session.versione} stato={state.session.stato}
        managers={state.managers} nomination={state.nomination ?? null}
        topPagati={topPagati} affari={affari}
        consiglio={consiglio} inflazione={infl} prossime={next?.top ?? []} ownerNome={owner?.nome ?? ""}
      />
    </main>
  );
}
