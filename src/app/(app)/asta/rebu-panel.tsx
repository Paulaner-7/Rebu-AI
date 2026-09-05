"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, RefreshCw, X } from "lucide-react";
import ChatBox from "../chat/chatbox";
import { btnGhost, btnPrimary, cx } from "@/components/ui";

export type VerdettoRebu = {
  testo: string;
  azione: "COMPRA" | "RILANCIA_FINO_A" | "PASSA";
  prezzo: number;
  confidenza: "BASSA" | "MEDIA" | "ALTA";
  motivazioni: string[];
  alternative: string[];
  parere: string | null;
  via: "ai" | "motore";
  model: string;
  versione: number;
  rilevante: boolean;
  motivoRilevanza: string;
};

type Stato = "idle" | "analisi" | "pronto" | "errore";

type Storico = { nome: string; azione: VerdettoRebu["azione"]; prezzo: number; via: "ai" | "motore" };

const DOT: Record<string, string> = {
  COMPRA: "bg-d",
  RILANCIA_FINO_A: "bg-signal",
  PASSA: "bg-danger",
};

const AZIONE_LABEL: Record<VerdettoRebu["azione"], string> = {
  COMPRA: "Compra",
  RILANCIA_FINO_A: "Rilancia fino a",
  PASSA: "Passa",
};

async function postVerdetto(body: object): Promise<VerdettoRebu> {
  const r = await fetch("/api/rebu/verdetto", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.code ?? "Errore");
  return j.data as VerdettoRebu;
}

export default function RebuPanel({ sid, ownerId, nomination, offerta, stato }: {
  sid: number; ownerId: number | null;
  nomination: { o: number; nome: string } | null;
  offerta: number | null; stato: string;
}) {
  const [st, setSt] = useState<Stato>("idle");
  const [v, setV] = useState<VerdettoRebu | null>(null);
  const [storico, setStorico] = useState<Storico[]>([]);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [offertaAnalizzata, setOffertaAnalizzata] = useState<number | null>(null);
  const autoPer = useRef<number | null>(null);

  const analizza = useCallback(async (forza: boolean, apriSe: "sempre" | "seRilevante") => {
    if (!nomination || !ownerId || stato !== "LIVE") return;
    setSt("analisi"); setErr("");
    try {
      const d = await postVerdetto({ sessionId: sid, managerId: ownerId, officialId: nomination.o, forza });
      setV(d); setSt("pronto");
      setOffertaAnalizzata(offerta);
      setStorico((s) => [{ nome: nomination.nome, azione: d.azione, prezzo: d.prezzo, via: d.via }, ...s].slice(0, 5));
      if (apriSe === "sempre" || (apriSe === "seRilevante" && d.rilevante)) setOpen(true);
    } catch (e) {
      setSt("errore");
      setErr(e instanceof Error ? e.message : "Errore");
    }
  }, [nomination, ownerId, sid, stato, offerta]);

  // Auto su nuova chiamata (griglia Q2+Q9): analisi parte, drawer solo se rilevante.
  useEffect(() => {
    if (!nomination || autoPer.current === nomination.o) return;
    autoPer.current = nomination.o;
    setV(null); setOpen(false);
    void analizza(false, "seRilevante");
  }, [nomination, analizza]);

  const offertaCambiata = v !== null && offertaAnalizzata !== offerta;
  const dot = st === "analisi" ? "bg-signal animate-pulse" : v ? (v.rilevante ? (DOT[v.azione] ?? "bg-faint") : "bg-faint") : "bg-faint";

  const corpo = (
    <div className="flex flex-col gap-3">
      {st === "idle" && <p className="text-sm text-muted">Nomina un giocatore: Rebu lo analizza da solo.</p>}
      {st === "analisi" && <p className="text-sm text-muted">Rebu analizza {nomination?.nome}…</p>}
      {st === "errore" && <p className="text-sm text-danger">Rebu non risponde ({err}). Banda motore disponibile al prossimo giro.</p>}
      {v && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className={cx("rounded-full px-3 py-1 text-sm font-bold", v.azione === "COMPRA" && "bg-d/20 text-d", v.azione === "RILANCIA_FINO_A" && "bg-signal/20 text-signal", v.azione === "PASSA" && "bg-danger/20 text-danger")}>
              {AZIONE_LABEL[v.azione]}{v.azione !== "PASSA" ? ` ${v.prezzo}` : ""}
            </span>
            <span className="ml-auto font-mono text-[10px] uppercase text-faint">{v.via === "ai" ? "Rebu AI" : "motore"}</span>
          </div>
          <p className="text-sm">{v.testo}</p>
          {v.parere && <p className="rounded-xl border border-line bg-panel2 p-2 text-sm italic">Rebu: “{v.parere}”</p>}
          {v.alternative.length > 0 && (
            <div className="text-sm text-muted">Se scappa: {v.alternative.join(" · ")}</div>
          )}
          {!v.rilevante && <p className="text-xs text-faint">{v.motivoRilevanza}</p>}
          {offertaCambiata && <p className="text-xs text-signal">Offerta cambiata ({offertaAnalizzata ?? "—"} → {offerta ?? "—"}): aggiorna.</p>}
          <div className="flex gap-2">
            <button onClick={() => void analizza(true, "sempre")} className={btnGhost} aria-label="Ricalcola verdetto">
              <RefreshCw className="size-4" aria-hidden /> Aggiorna
            </button>
          </div>
        </div>
      )}
      {storico.length > 0 && (
        <div className="border-t border-line pt-2">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-faint">Ultimi verdetti</p>
          {storico.map((s, i) => (
            <p key={i} className="tnum text-xs text-muted">{s.nome} — {AZIONE_LABEL[s.azione]}{s.azione !== "PASSA" ? ` ${s.prezzo}` : ""} <span className="text-faint">({s.via})</span></p>
          ))}
        </div>
      )}
      <div className="border-t border-line pt-2">
        <ChatBox compact />
      </div>
    </div>
  );

  const fabLabel = st === "analisi" ? "Rebu analizza…" : v ? `${AZIONE_LABEL[v.azione]}${v.azione !== "PASSA" ? ` ${v.prezzo}` : ""}` : "Rebu";

  return (
    <>
      {/* desktop: pannello compatto al posto della chat */}
      <aside className="hidden max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-panel xl:sticky xl:top-4 xl:flex" aria-label="Pannello Rebu">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="relative flex size-2" aria-hidden>
            <span className={cx("relative inline-flex size-2 rounded-full", dot)} />
          </span>
          <Cpu className="size-4 text-signal" aria-hidden />
          <p className="font-display text-sm font-bold uppercase tracking-wide">Rebu</p>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-faint">{v?.via === "ai" ? "ai" : v ? "motore" : "pronto"}</span>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-3">
          <button
            onClick={() => (v && !offertaCambiata ? setOpen(true) : void analizza(v !== null && !v.rilevante, "sempre"))}
            disabled={!nomination || stato !== "LIVE" || st === "analisi"}
            className={btnPrimary}
          >
            <Cpu className="size-4" aria-hidden />
            {nomination ? fabLabel : "Rebu"}
          </button>
          {open && corpo}
        </div>
      </aside>
      {/* mobile + tablet: FAB + sheet */}
      <div className="xl:hidden">
        {!open && (
          <button
            onClick={() => (v && !offertaCambiata ? setOpen(true) : void analizza(v !== null && !v.rilevante, "sempre"))}
            disabled={!nomination || stato !== "LIVE"}
            aria-label="Chiedi a Rebu"
            className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex min-h-[56px] items-center gap-2 rounded-full bg-signal px-5 font-semibold text-bg shadow-lg transition active:scale-95 lg:bottom-6 disabled:opacity-50"
          >
            <span className={cx("inline-flex size-2 rounded-full bg-bg/70", st === "analisi" && "animate-pulse")} aria-hidden />
            <Cpu className="size-5" aria-hidden />
            {nomination ? fabLabel : "Rebu"}
          </button>
        )}
        {open && (
          <div className="fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col rounded-t-2xl border border-line bg-panel shadow-2xl" role="dialog" aria-label="Verdetto Rebu">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Cpu className="size-4 text-signal" aria-hidden />
              <p className="font-display text-sm font-bold uppercase tracking-wide">Rebu</p>
              <button onClick={() => setOpen(false)} aria-label="Chiudi Rebu" className="ml-auto rounded-lg border border-line p-2">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {corpo}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
