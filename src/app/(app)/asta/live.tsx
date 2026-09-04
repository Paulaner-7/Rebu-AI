"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Found } from "@/lib/catalog";
import {
  ChevronRight,
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
const ROLE_DOT: Record<string, string> = { P: "bg-p", D: "bg-d", C: "bg-c", A: "bg-a" };

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
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3">
      {/* ——— AVVIO ——— */}
      {stato === "PRONTA" && (
        <Panel className="flex flex-col gap-3 text-center">
          <p className="text-sm text-muted">Il dataset verrà congelato.</p>
          <button disabled={busy} onClick={() => go(() => post("/api/auction/start", { sessionId: sid, expected: versione }))} className={btnPrimary}>
            <Play className="size-4" aria-hidden />
            Avvia asta
          </button>
        </Panel>
      )}

      {/* ——— NAVIGAZIONE ASTA CENTRATA: reparti stile Sofascore ——— */}
      {(stato === "LIVE" || stato === "PAUSA" || stato === "PRONTA") && (
        <nav aria-label="Reparti asta" className="flex justify-center px-1">
          <div className="inline-flex max-w-full overflow-x-auto rounded-full border border-line bg-panel p-1" role="tablist" aria-label="Ruolo in chiamata">
            {RUOLI.map((r) => {
              const active = ruoloVista === r;
              return (
                <span
                  key={r}
                  role="tab"
                  aria-selected={active}
                  className={cx(
                    "flex min-w-[52px] cursor-default items-center justify-center gap-1.5 rounded-full px-4 py-2 font-mono text-sm font-bold transition",
                    active ? "bg-panel2 text-ink shadow-[inset_0_0_0_1px_var(--color-signal)]" : "text-faint"
                  )}
                >
                  <span className={cx("size-1.5 rounded-full", ROLE_DOT[r], !active && "opacity-40")} aria-hidden />
                  {r}
                </span>
              );
            })}
          </div>
        </nav>
      )}

      {/* ——— SCOREBOARD CHIAMATA: hero centrale stile Sofascore ——— */}
      <section className="overflow-hidden rounded-2xl border border-line bg-panel" aria-live="polite">
        {nomination ? (
          <>
            <div className="border-b border-line/70 bg-[radial-gradient(420px_160px_at_50%_-40px,rgb(255_178_36/0.12),transparent_70%)] px-4 pb-4 pt-4 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                {nomination.chiamatoDa ? `da ${nomination.chiamatoDa.nome}` : "Chiamata"}
              </p>
              <div className="mt-2 flex min-w-0 items-center justify-center gap-2 px-2">
                <RoleBadge r={nomination.ruolo} className="h-6 min-w-6 shrink-0 text-xs" />
                <h2 className="font-display min-w-0 break-words text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl">
                  {nomination.nome}
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted">{nomination.squadra}</p>
              <p className="tnum mt-3 font-mono text-6xl font-bold leading-none text-signal">
                {ultimaChiamata ? ultimaChiamata.prezzo : "—"}
              </p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Ultima chiamata</p>
              {consiglio && (
                <div className="tnum mx-auto mt-3 flex max-w-md items-center justify-center gap-4 rounded-lg border border-line bg-panel2/70 px-3 py-2 font-mono text-[11px] text-muted">
                  <span>rif <b className="text-ink">{consiglio.rif.valore}</b></span>
                  <span className="h-3 w-px bg-line" aria-hidden />
                  <span>tetto <b className="text-ink">{consiglio.tetto.consigliato}</b></span>
                  <span className="h-3 w-px bg-line" aria-hidden />
                  <span>infl. <b className="text-ink">{Math.round(inflazione.totale)}%</b></span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 p-4">
              {/* Rialzo */}
              <div className="flex gap-2">
                <input
                  value={rialzo}
                  onChange={(e) => setRialzo(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder="Offerta"
                  aria-label="Offerta"
                  className="tnum min-h-[56px] w-full rounded-xl border border-line bg-panel2 px-4 text-center font-mono text-2xl font-bold text-signal transition placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:text-faint focus:border-signal/60 focus:outline-none"
                />
                <button
                  disabled={!canBid}
                  onClick={() => { setBusy(true); go(() => post("/api/auction/bid", {
                      sessionId: sid, officialId: nomination.o, prezzo: Number(rialzo), expected: versione,
                    }).then(() => setRialzo(""))).finally(() => setBusy(false)); }}
                  className={cx(btnPrimary, "shrink-0 rounded-xl px-8 text-base")}
                >
                  Chiama
                </button>
              </div>

              {/* Verdetto Rebu */}
              {verdetto && ultimaChiamata && (
                <div
                  role="status"
                  className={cx(
                    "rounded-xl border p-3",
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

              {/* Vincitore */}
              <div>
                <Eyebrow>Assegna a</Eyebrow>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {managers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setTeam(m.id)}
                      aria-pressed={team === m.id}
                      className={cx(
                        "min-h-[56px] cursor-pointer rounded-xl border px-2 py-2 text-center transition active:scale-[0.98]",
                        team === m.id ? "border-signal bg-signal/10" : "border-line bg-panel2 hover:border-faint"
                      )}
                    >
                      <b className="block truncate text-[13px]">{m.nome}</b>
                      <span className="tnum font-mono text-[11px] text-muted">{m.residui} cr</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!canStop}
                  onClick={() => { setBusy(true); go(() => post("/api/auction/sell", {
                      sessionId: sid, officialId: nomination.o, managerId: team, prezzo: ultimaChiamata!.prezzo,
                      idem: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, expected: versione,
                    }).then(() => { setTeam(null); setRialzo(""); })).finally(() => setBusy(false)); }}
                  className={cx(btnPrimary, "min-w-0 flex-1 rounded-xl text-sm sm:text-base")}
                >
                  <span className="truncate">Stop · {teamSel ? `${teamSel.nome} · ${ultimaChiamata ? ultimaChiamata.prezzo : "—"}` : "Scegli vincitore"}</span>
                </button>
                <button
                  disabled={busy}
                  onClick={() => go(() => post("/api/auction/unsold", { sessionId: sid, officialId: nomination.o, expected: versione }).then(() => { setTeam(null); setRialzo(""); }))}
                  className={cx(btnGhost, "shrink-0")}
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
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              {stato === "LIVE" ? "Tocca a chiamare" : stato}
            </p>
            <p className="font-display text-xl font-extrabold uppercase">
              {stato === "LIVE"
                ? (prossimoChiamante ? `Tocca a ${prossimoChiamante.nome}` : "Nessuna chiamata")
                : stato === "PRONTA" ? "Pronti al via" : `Asta ${stato}`}
            </p>
            <p className="max-w-sm text-sm text-muted">
              {stato === "LIVE" ? "Cerca e tocca un nome." : stato === "PRONTA" ? "Avvia quando pronti." : ""}
            </p>
            {(stato === "LIVE" || stato === "PAUSA") && (
              <div className="flex flex-wrap justify-center gap-2">
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
          <p className="mx-4 mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {err}
          </p>
        )}
      </section>

      {stato === "LIVE" && (
        <Panel className="!rounded-2xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              value={q}
              onChange={(e) => cerca(e.target.value)}
              placeholder="Cerca giocatore…"
              aria-label="Cerca giocatore"
              className="min-h-[48px] w-full rounded-xl border border-line bg-panel2 pl-9 pr-3 text-base text-ink transition placeholder:text-faint focus:border-signal/60 focus:outline-none"
            />
          </div>
          {ris.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {ris.map((p) => (
                <li key={p.official_id}>
                  <button
                    disabled={busy}
                    onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.official_id, expected: versione }))}
                    className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-panel2 px-3 text-left transition hover:border-faint active:scale-[0.99]"
                  >
                    <RoleBadge r={p.ruolo} />
                    <span className="min-w-0 flex-1 truncate">
                      <b>{p.nome}</b> <span className="text-muted">· {p.squadra}</span>
                      {p.titolare ? <span className="ml-2"><XIChip /></span> : null}
                    </span>
                    <span className="tnum shrink-0 font-mono text-sm text-muted">Qt {p.qt ?? "—"}</span>
                    <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ——— RIMANENTI RUOLO ——— */}
      {(stato === "LIVE" || stato === "PAUSA" || stato === "PRONTA") && ruoloVista && (
        <Panel className="!rounded-2xl !p-3 sm:!p-4">
          <PanelHead icon={Crosshair} title={`Rimanenti ${ruoloVista}`} hint={`${rim.length}`} />
          {rim.length === 0 ? (
            <p className="px-1 py-3 text-center text-sm text-faint">…</p>
          ) : (
            <>
              <ol className="flex flex-col gap-1.5">
                {rim.slice(0, 3).map((p, i) => (
                  <li key={p.o}>
                    <button
                      disabled={busy}
                      onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.o, expected: versione }))}
                      className="flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-xl border border-signal/40 bg-signal/10 px-3 text-left transition hover:border-signal active:scale-[0.99]"
                    >
                      <span className="tnum font-mono text-xs font-bold text-signal">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <b>{p.nome}</b> <span className="text-muted">· {p.squadra}</span>
                        {p.titolare ? <span className="ml-2"><XIChip /></span> : null}
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-faint" title={p.motivi.join(", ")}>{p.motivi.join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-right font-mono text-xs">
                        <span className="tnum block text-base font-bold">rif {p.rif}</span>
                        <span className="tnum block text-muted">tetto {p.tetto}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <ul className="mt-1.5 flex max-h-80 flex-col overflow-y-auto overscroll-contain">
                {rim.slice(3).map((p) => (
                  <li key={p.o} className="border-b border-line/50 last:border-0">
                    <button
                      disabled={busy}
                      onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.o, expected: versione }))}
                      className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-2 text-left transition hover:bg-panel2 active:scale-[0.99]"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <b>{p.nome}</b> <span className="text-muted">· {p.squadra}</span>
                        {p.titolare ? <span className="ml-2"><XIChip /></span> : null}
                      </span>
                      <span className="tnum hidden shrink-0 font-mono text-xs text-muted sm:inline">Qt {p.qt ?? "—"}</span>
                      <span className="tnum hidden shrink-0 font-mono text-xs text-muted sm:inline">FVM {p.fvm ?? "—"}</span>
                      <span className="tnum w-10 shrink-0 text-right font-mono text-sm font-bold" title={`rif ${p.rif} · tetto ${p.tetto}`}>{p.rif}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      {/* ——— RIEPILOGHI ——— */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="!rounded-2xl">
          <PanelHead icon={Trophy} title="Più pagati" />
          <ol className="flex flex-col text-sm">
            {topPagati.length === 0 && <li className="text-faint">—</li>}
            {topPagati.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2 border-b border-line/50 py-2 last:border-0">
                <span className="tnum w-5 shrink-0 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate"><b>{t.nome}</b> <span className="text-faint">({t.squadra})</span></span>
                <span className="hidden shrink-0 text-xs text-muted md:inline">{t.chi}</span>
                <span className="tnum w-10 shrink-0 text-right font-mono font-bold">{t.prezzo}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel className="!rounded-2xl">
          <PanelHead icon={TrendingUp} title="Migliori affari" hint="FVM/2" />
          <ol className="flex flex-col text-sm">
            {affari.length === 0 && <li className="text-faint">—</li>}
            {affari.map((t, i) => (
              <li key={i} className="flex items-baseline gap-2 border-b border-line/50 py-2 last:border-0">
                <span className="tnum w-5 shrink-0 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate"><b>{t.nome}</b> <span className="text-faint">({t.squadra})</span></span>
                <span className="tnum shrink-0 font-mono font-bold text-d">{t.prezzo}</span>
                <span className="tnum w-10 shrink-0 text-right font-mono text-xs text-faint">/{t.rif}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

    </div>
  );
}
