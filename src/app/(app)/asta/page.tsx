import { publicState, writableDb, defaultManagers } from "@/lib/auction-store";
import { prezzoRiferimento, tettoConsigliato, inflazioneAsta, prossimeChiamate, verdettoRialzo } from "@/lib/pricing";
import { Download } from "lucide-react";
import { Eyebrow, StatusPill } from "@/components/ui";
import Console from "./console";
import Live from "./live";
import AiDock from "./ai-dock";
import TeamsRail from "./teams-rail";

export const dynamic = "force-dynamic";

const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function Page() {
  const { sid, state } = publicState();
  if (sid === null || state === null) {
    return (
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
        <header>
          <Eyebrow>Console</Eyebrow>
          <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Asta</h1>
          <p className="mt-1 text-sm text-muted">Prepara l'asta: compila i nomi.</p>
        </header>
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
  const verdetto = state.nomination && owner && state.ultimaChiamata
    ? verdettoRialzo(db, sid, owner.id, state.nomination.o, state.ultimaChiamata.prezzo)
    : null;
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
    <div className="flex flex-col gap-3">
      {/* ——— strip Sofascore: stato + contesto, centrata ——— */}
      <header className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 xl:max-w-none">
        <div className="min-w-0">
          <Eyebrow>Asta live · Lega 8</Eyebrow>
          <p className="mt-0.5 truncate text-sm text-muted">
            {state.ruoloCorrente ? <>Reparto <b className="text-ink">{state.ruoloCorrente}</b></> : "Reparto —"}
            {state.prossimoChiamante ? <> · tocca a <b className="text-ink">{state.prossimoChiamante.nome}</b></> : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill stato={state.session.stato} />
          <span className="tnum font-mono text-[11px] text-faint">v{state.session.versione}</span>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        {/* ——— SINISTRA: cards squadre avversari ——— */}
        <div className="order-2 lg:order-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
          <TeamsRail managers={plain(state.managers)} ownerNome={owner?.nome ?? ""} />
        </div>

        {/* ——— CENTRO: navigazione asta ——— */}
        <main className="order-1 min-w-0 lg:order-2">
          <Live
            sid={sid} versione={state.session.versione} stato={state.session.stato}
            managers={plain(state.managers)} nomination={plain(state.nomination ?? null)}
            ultimaChiamata={plain(state.ultimaChiamata)} verdetto={plain(verdetto)}
            prossimoChiamante={plain(state.prossimoChiamante)} ruoloCorrente={state.ruoloCorrente}
            topPagati={plain(topPagati)} affari={plain(affari)}
            consiglio={plain(consiglio)} inflazione={plain(infl)} prossime={plain(next?.top ?? [])} ownerNome={owner?.nome ?? ""}
          />
          {state.session.stato === "CONCLUSA" && (
            <div className="mx-auto mt-3 flex w-full max-w-[720px] flex-col gap-2">
              <p className="text-sm text-muted">Asta conclusa. Scarica il backup.</p>
              <div className="flex gap-2">
                <a href="/api/backup" className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-signal px-4 font-semibold text-bg transition hover:brightness-110 active:scale-[0.98]">
                  <Download className="size-4" aria-hidden />
                  Backup completo
                </a>
                <a href={`/api/exports/csv?sessionId=${sid}`} className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 font-semibold text-bg transition hover:bg-white active:scale-[0.98]">
                  <Download className="size-4" aria-hidden />
                  CSV leghe
                </a>
              </div>
            </div>
          )}
        </main>

        {/* ——— DESTRA: chat ——— */}
        <div className="order-3 lg:col-span-2 xl:col-span-1">
          <AiDock />
        </div>
      </div>
    </div>
  );
}
