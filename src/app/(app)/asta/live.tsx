"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Found } from "@/lib/catalog";
import {
  ChevronDown,
  CircleStop,
  Crosshair,
  Pause,
  Play,
  Search,
  TriangleAlert,
  TrendingUp,
  Trophy,
  Undo2,
} from "lucide-react";
import { btnDanger, btnGhost, btnPrimary, cx, Eyebrow, Panel, PanelHead, RoleBadge, XIChip } from "@/components/ui";

async function post(path: string, body: object) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.code ? `${j.code}: ${j.message}` : "Errore");
  return j.data;
}

export type Mgr = {
  id: number; nome: string; residui: number; maxSpesa: number;
  slot: Record<string, { usati: number; totali: number }>;
  rosa: { nome: string; squadra: string; ruolo: string; prezzo: number }[];
};
export type Nom = { o: number; nome: string; squadra: string; ruolo: string; chiamatoDa?: { id: number; nome: string } | null } | null;
export type Ultima = { prezzo: number } | null;
export type VerdettoUI = {
  verdetto: "ALZA" | "TENTENNA" | "MOLLA";
  titolo: string; dettaglio: string;
  numeri: { offerta: number; previsto: number; adattato: number; tetto: number };
} | null;

export type Rimanente = {
  o: number; nome: string; squadra: string; ruolo: string;
  qt: number | null; fvm: number | null; titolare: number;
  rif: number; tetto: number; score: number; motivi: string[];
};

const RUOLI = ["P", "D", "C", "A"] as const;

export default function Live({ sid, versione, stato, managers, nomination, ultimaChiamata, verdetto, prossimoChiamante, ruoloCorrente, topPagati, affari, consiglio, inflazione, prossime, ownerNome }: {
  sid: number; versione: number; stato: string; managers: Mgr[]; nomination: Nom;
  ultimaChiamata: Ultima; verdetto: VerdettoUI; prossimoChiamante: { indice: number; managerId: number; nome: string } | null; ruoloCorrente: string | null;
  topPagati: { nome: string; squadra: string; chi: string; prezzo: number }[];
  affari: { nome: string; squadra: string; chi: string; prezzo: number; rif: number }[];
  consiglio: { rif: { valore: number; formula: string }; tetto: { previsto: number; inflazioneReparto: number; adattato: number; tettoMax: number; consigliato: number } } | null;
  inflazione: { reparti: Record<string, { valore: number; n: number }>; totale: number };
  prossime: { nome: string; squadra: string; ruolo: string; score: number; motivi: string[] }[];
  ownerNome: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [ris, setRis] = useState<Found[]>([]);
  const [team, setTeam] = useState<number | null>(null);
  const [rialzo, setRialzo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Ruolo in vista: chiamato ora, altrimenti corrente asta (avanza P→D→C→A da solo
  // quando tutti completano reparto). Visibile anche prima di chiamare.
  const ruoloVista = nomination?.ruolo ?? ruoloCorrente;
  const [rim, setRim] = useState<Rimanente[]>([]);

  useEffect(() => {
    if (!ruoloVista || (stato !== "LIVE" && stato !== "PAUSA" && stato !== "PRONTA")) { setRim([]); return; }
    let stop = false;
    fetch(`/api/players/rimanenti?sessionId=${sid}&ruolo=${ruoloVista}&limit=30`)
      .then((r) => r.json())
      .then((j) => { if (!stop && j.ok) setRim(j.data); })
      .catch(() => {});
    return () => { stop = true; };
  }, [sid, ruoloVista, versione, stato]);

  async function go(fn: () => Promise<void>) {
    setErr("");
    try { await fn(); setQ(""); setRis([]); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Errore"); }
  }
  async function cerca(v: string) {
    setQ(v);
    if (v.trim().length < 3) { setRis([]); return; }
    const r = await fetch(`/api/players/search?sessionId=${sid}&q=${encodeURIComponent(v)}`);
    const j = await r.json();
    if (j.ok) setRis(j.data);
  }
  const teamSel = managers.find((m) => m.id === team);
  const canBid = nomination && Number(rialzo) >= 1 && !busy && stato === "LIVE";
  const canStop = nomination && team && ultimaChiamata && !busy && stato === "LIVE";

  return (
    <div className="flex flex-col gap-3">
      {/* ——— AVVIO ——— */}
      {stato === "PRONTA" && (
        <Panel className="flex flex-col gap-3">
          <p className="text-sm text-muted">Asta pronta. All&apos;avvio il dataset viene congelato.</p>
          <button disabled={busy} onClick={() => go(() => post("/api/auction/start", { sessionId: sid, expected: versione }))} className={btnPrimary}>
            <Play className="size-4" aria-hidden />
            Avvia asta
          </button>
        </Panel>
      )}

      {/* ——— CHIAMATA CORRENTE: rialzi → verdetto → STOP ——— */}
      <Panel>
        {nomination ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Eyebrow>Ora chiamato{nomination.chiamatoDa ? ` · da ${nomination.chiamatoDa.nome}` : ""}</Eyebrow>
                <p className="font-display mt-1 truncate text-3xl font-extrabold uppercase leading-none tracking-tight">{nomination.nome}</p>
                <p className="mt-1.5 text-sm text-muted">{nomination.squadra}</p>
              </div>
              <RoleBadge r={nomination.ruolo} className="mt-1 h-6 min-w-6 text-xs" />
            </div>

            <div className="mt-4 rounded-lg border border-line bg-panel2 px-4 py-3 text-center">
              <Eyebrow>Ultima chiamata</Eyebrow>
              <p className="tnum mt-0.5 font-mono text-5xl font-semibold text-signal">{ultimaChiamata ? ultimaChiamata.prezzo : "—"}</p>
            </div>

            {/* Rialzo in ordine sparso */}
            <div className="mt-3 flex gap-2">
              <input
                value={rialzo}
                onChange={(e) => setRialzo(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                inputMode="numeric"
                placeholder="Crediti offerti"
                aria-label="Crediti offerti nel rialzo"
                className="tnum min-h-[56px] w-full rounded-lg border border-line bg-panel2 px-4 font-mono text-2xl font-semibold text-signal transition placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
              <button
                disabled={!canBid}
                onClick={() => { setBusy(true); go(() => post("/api/auction/bid", {
                    sessionId: sid, officialId: nomination.o, prezzo: Number(rialzo), expected: versione,
                  }).then(() => setRialzo(""))).finally(() => setBusy(false)); }}
                className={cx(btnPrimary, "shrink-0 px-6")}
              >
                Chiama
              </button>
            </div>

            {/* Finestra consiglio Rebu AI: appare a ogni chiamata */}
            {verdetto && ultimaChiamata && (
              <div
                role="status"
                className={cx(
                  "mt-3 rounded-lg border p-3",
                  verdetto.verdetto === "ALZA" && "border-d/40 bg-d/10",
                  verdetto.verdetto === "TENTENNA" && "border-signal/40 bg-signal/10",
                  verdetto.verdetto === "MOLLA" && "border-danger/40 bg-danger/10"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cx(
                    "rounded px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-wider",
                    verdetto.verdetto === "ALZA" && "bg-d/20 text-d",
                    verdetto.verdetto === "TENTENNA" && "bg-signal/20 text-signal",
                    verdetto.verdetto === "MOLLA" && "bg-danger/20 text-danger"
                  )}>
                    {verdetto.verdetto === "ALZA" ? "Alza" : verdetto.verdetto === "TENTENNA" ? "Tentenna" : "Molla"}
                  </span>
                  <p className="text-sm font-semibold">{verdetto.titolo}</p>
                </div>
                <p className="mt-1.5 text-sm text-muted">{verdetto.dettaglio}</p>
                <p className="tnum mt-2 font-mono text-[11px] text-faint">
                  offerta {verdetto.numeri.offerta} · previsto {verdetto.numeri.previsto} · adattato {verdetto.numeri.adattato} · tuo tetto {verdetto.numeri.tetto}
                </p>
              </div>
            )}

            {/* STOP: vincitore + assegnazione a ultima chiamata */}
            <div className="mt-4">
              <Eyebrow>A chi va? (vincitore ultima chiamata)</Eyebrow>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {managers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setTeam(m.id)}
                    aria-pressed={team === m.id}
                    className={cx(
                      "min-h-[48px] cursor-pointer rounded-lg border px-3 text-left transition active:scale-[0.98]",
                      team === m.id ? "border-signal bg-signal/10" : "border-line bg-panel2 hover:border-faint"
                    )}
                  >
                    <b className="block truncate">{m.nome}</b>
                    <span className="tnum font-mono text-xs text-muted">{m.residui} cr · max {m.maxSpesa}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                disabled={!canStop}
                onClick={() => { setBusy(true); go(() => post("/api/auction/sell", {
                    sessionId: sid, officialId: nomination.o, managerId: team, prezzo: ultimaChiamata!.prezzo,
                    idem: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, expected: versione,
                  }).then(() => { setTeam(null); setRialzo(""); })).finally(() => setBusy(false)); }}
                className={cx(btnPrimary, "flex-1")}
              >
                Stop · {teamSel ? `${teamSel.nome} a ${ultimaChiamata ? ultimaChiamata.prezzo : "—"}` : "scegli vincitore"}
              </button>
              <button
                disabled={busy}
                onClick={() => go(() => post("/api/auction/unsold", { sessionId: sid, officialId: nomination.o, expected: versione }).then(() => { setTeam(null); setRialzo(""); }))}
                className={btnGhost}
              >
                Invenduto
              </button>
              <button
                disabled={busy}
                aria-label="Annulla ultima operazione"
                title="Annulla ultima operazione"
                onClick={() => { if (confirm("Annullare ultima operazione?")) go(() => post("/api/auction/undo", { sessionId: sid, expected: versione })); }}
                className={cx(btnGhost, "w-12 shrink-0 px-0")}
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                disabled={busy}
                aria-label={stato === "LIVE" ? "Pausa" : "Riprendi"}
                title={stato === "LIVE" ? "Pausa" : "Riprendi"}
                onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: stato === "LIVE" ? "pause" : "resume", expected: versione }))}
                className={cx(btnGhost, "w-12 shrink-0 px-0")}
              >
                {stato === "LIVE" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              </button>
            </div>
            {!ultimaChiamata && (
              <p className="mt-2 font-mono text-[11px] text-faint">Nessuna chiamata: STOP attivo dopo primo rialzo. Senza offerte usa Invenduto.</p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {stato === "LIVE"
                ? (prossimoChiamante ? `Tocca a ${prossimoChiamante.nome} chiamare. Cerca sotto e tocca un nome.` : "Nessuna chiamata. Cerca sotto e tocca un nome.")
                : stato === "PRONTA" ? "Tutto pronto: avvia quando le squadre sono ai posti." : `Asta in stato ${stato}.`}
            </p>
            {(stato === "LIVE" || stato === "PAUSA") && (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: stato === "LIVE" ? "pause" : "resume", expected: versione }))} className={btnGhost}>
                  {stato === "LIVE" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  {stato === "LIVE" ? "Pausa" : "Riprendi"}
                </button>
                <button disabled={busy} onClick={() => { if (confirm("Annullare ultima operazione?")) go(() => post("/api/auction/undo", { sessionId: sid, expected: versione })); }} className={btnGhost}>
                  <Undo2 className="size-4" aria-hidden />
                  Annulla ultima
                </button>
                <button disabled={busy} onClick={() => { if (confirm("Concludere l'asta?")) go(() => post("/api/auction/control", { sessionId: sid, action: "complete", expected: versione })); }} className={btnDanger}>
                  <CircleStop className="size-4" aria-hidden />
                  Concludi
                </button>
              </div>
            )}
          </div>
        )}
        {err && (
          <p className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {err}
          </p>
        )}
      </Panel>

      {stato === "LIVE" && (
        <>
          {/* ——— RICERCA ——— */}
          <Panel>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
              <input
                value={q}
                onChange={(e) => cerca(e.target.value)}
                placeholder="Digita 3+ lettere (nome o squadra)"
                aria-label="Cerca giocatore da nominare"
                className="min-h-[48px] w-full rounded-lg border border-line bg-panel2 pl-9 pr-3 text-base text-ink transition placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
            </div>
            {ris.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {ris.map((p) => (
                  <li key={p.official_id}>
                    <button
                      disabled={busy}
                      onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.official_id, expected: versione }))}
                      className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 rounded-lg border border-line bg-panel2 px-3 text-left transition hover:border-faint active:scale-[0.99]"
                    >
                      <RoleBadge r={p.ruolo} />
                      <span className="min-w-0 flex-1 truncate">
                        <b>{p.nome}</b> <span className="text-muted">· {p.squadra}</span>
                        {p.titolare ? <span className="ml-2"><XIChip /></span> : null}
                      </span>
                      <span className="tnum shrink-0 font-mono text-sm text-muted">Qt {p.qt ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ——— ACQUIRENTE: rimosso, selezione vincitore dentro chiamata ——— */}
        </>
      )}

      {/* ——— RIMANENTI RUOLO ——— */}
      {(stato === "LIVE" || stato === "PAUSA" || stato === "PRONTA") && ruoloVista && (
        <Panel>
          <PanelHead icon={Crosshair} title={`Rimanenti ${ruoloVista}`} hint={`${rim.length} disponibili · tocca per chiamare`} />
          {rim.length === 0 ? (
            <p className="text-sm text-faint">Caricamento…</p>
          ) : (
            <>
              <ol className="flex flex-col gap-1.5">
                {rim.slice(0, 3).map((p, i) => (
                  <li key={p.o}>
                    <button
                      disabled={busy}
                      onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.o, expected: versione }))}
                      className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-lg border border-signal/40 bg-signal/10 px-3 text-left transition hover:border-signal active:scale-[0.99]"
                    >
                      <span className="tnum font-mono text-xs font-semibold text-signal">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <b>{p.nome}</b> <span className="text-muted">· {p.squadra}</span>
                        {p.titolare ? <span className="ml-2"><XIChip /></span> : null}
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-faint" title={p.motivi.join(", ")}>{p.motivi.join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-xs">
                        <span className="tnum block font-semibold">rif {p.rif}</span>
                        <span className="tnum block text-muted">tetto {p.tetto}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <ul className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto">
                {rim.slice(3).map((p) => (
                  <li key={p.o}>
                    <button
                      disabled={busy}
                      onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.o, expected: versione }))}
                      className="flex min-h-[48px] w-full cursor-pointer items-center gap-3 rounded-lg border border-line bg-panel2 px-3 text-left transition hover:border-faint active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <b>{p.nome}</b> <span className="text-muted">· {p.squadra}</span>
                        {p.titolare ? <span className="ml-2"><XIChip /></span> : null}
                      </span>
                      <span className="tnum shrink-0 font-mono text-xs text-muted">Qt {p.qt ?? "—"}</span>
                      <span className="tnum shrink-0 font-mono text-xs text-muted">FVM {p.fvm ?? "—"}</span>
                      <span className="tnum w-12 shrink-0 text-right font-mono text-xs font-semibold" title={`rif ${p.rif} · tetto ${p.tetto}`}>{p.rif}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      {/* ——— ROSE ——— */}
      <section className="flex flex-col gap-2" aria-label="Rose">
        {managers.map((m) => (
          <details key={m.id} className="group rounded-xl border border-line bg-panel">
            <summary className="flex min-h-[48px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <b className="flex-1 truncate">{m.nome}</b>
              <span className="tnum font-mono text-sm text-signal">{m.residui} cr</span>
              <span className="flex gap-1.5 font-mono text-[11px] text-muted">
                {RUOLI.map((r) => (
                  <span key={r} className="tnum">
                    <span className={cx("font-semibold", { P: "text-p", D: "text-d", C: "text-c", A: "text-a" }[r])}>{r}</span>
                    {m.slot[r].usati}/{m.slot[r].totali}
                  </span>
                ))}
              </span>
              <ChevronDown className="size-4 text-faint transition [details[open]_&]:rotate-180" aria-hidden />
            </summary>
            <ul className="border-t border-line px-4 py-2">
              {m.rosa.length === 0 && <li className="py-2 text-sm text-faint">Rosa vuota.</li>}
              {m.rosa.map((g, i) => (
                <li key={i} className="flex items-center gap-3 border-b border-line/50 py-2 text-sm last:border-0">
                  <RoleBadge r={g.ruolo} />
                  <span className="min-w-0 flex-1 truncate">{g.nome} <span className="text-faint">· {g.squadra}</span></span>
                  <span className="tnum font-mono text-muted">{g.prezzo}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      {/* ——— RIEPILOGHI ——— */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel>
          <PanelHead icon={Trophy} title="Più pagati" />
          <ol className="flex flex-col gap-1.5 text-sm">
            {topPagati.length === 0 && <li className="text-faint">Nessun acquisto.</li>}
            {topPagati.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="tnum w-5 shrink-0 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate"><b>{t.nome}</b> <span className="text-faint">({t.squadra})</span></span>
                <span className="shrink-0 text-muted">{t.chi}</span>
                <span className="tnum w-10 shrink-0 text-right font-mono font-semibold">{t.prezzo}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel>
          <PanelHead icon={TrendingUp} title="Migliori affari" hint="rif. FVM/2" />
          <ol className="flex flex-col gap-1.5 text-sm">
            {affari.length === 0 && <li className="text-faint">Nessun acquisto.</li>}
            {affari.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="tnum w-5 shrink-0 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate"><b>{t.nome}</b> <span className="text-faint">({t.squadra})</span></span>
                <span className="tnum shrink-0 font-mono font-semibold text-d">{t.prezzo}</span>
                <span className="tnum w-10 shrink-0 text-right font-mono text-xs text-faint">/{t.rif}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
