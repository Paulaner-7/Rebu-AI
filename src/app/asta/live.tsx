"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Found } from "@/lib/catalog";

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
export type Nom = { o: number; nome: string; squadra: string; ruolo: string } | null;

const TASTI = ["1","2","3","4","5","6","7","8","9","C","0","⌫"];

export default function Live({ sid, versione, stato, managers, nomination, topPagati, affari }: {
  sid: number; versione: number; stato: string; managers: Mgr[]; nomination: Nom;
  topPagati: { nome: string; squadra: string; chi: string; prezzo: number }[];
  affari: { nome: string; squadra: string; chi: string; prezzo: number; rif: number }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [ris, setRis] = useState<Found[]>([]);
  const [team, setTeam] = useState<number | null>(null);
  const [prezzo, setPrezzo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
  function digito(t: string) {
    if (t === "C") setPrezzo("");
    else if (t === "⌫") setPrezzo((p) => p.slice(0, -1));
    else setPrezzo((p) => (p + t).slice(0, 3));
  }
  const teamSel = managers.find((m) => m.id === team);
  const canSell = nomination && team && prezzo && !busy && stato === "LIVE";

  return (
    <div className="flex flex-col gap-3">
      {/* CHIAMATA CORRENTE */}
      <section className="rounded border bg-white p-3">
        {nomination ? (
          <>
            <p className="text-xs opacity-60">Ora chiamato</p>
            <p className="text-xl font-bold">{nomination.nome} <span className="text-sm font-normal opacity-60">· {nomination.squadra} · {nomination.ruolo}</span></p>
            <p className="mt-1 text-lg">Offerta: <b>{prezzo || "—"}</b>{teamSel ? <> · <b>{teamSel.nome}</b></> : null}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button disabled={!canSell} onClick={() => { setBusy(true); go(() => post("/api/auction/sell", {
                  sessionId: sid, officialId: nomination.o, managerId: team, prezzo: Number(prezzo),
                  idem: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, expected: versione,
                }).then(() => { setTeam(null); setPrezzo(""); })).finally(() => setBusy(false)); }}
                className="min-h-[48px] flex-1 rounded bg-black px-4 font-bold text-white disabled:opacity-40">Vendi</button>
              <button disabled={busy} onClick={() => go(() => post("/api/auction/unsold", { sessionId: sid, officialId: nomination.o, expected: versione }).then(() => { setTeam(null); setPrezzo(""); }))}
                className="min-h-[48px] rounded border px-4">Invenduto</button>
              <button disabled={busy} onClick={() => { if (confirm("Annullare ultima operazione?")) go(() => post("/api/auction/undo", { sessionId: sid, expected: versione })); }}
                className="min-h-[48px] rounded border px-4">Annulla ultima</button>
              <button disabled={busy} onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: stato === "LIVE" ? "pause" : "resume", expected: versione }))}
                className="min-h-[48px] rounded border px-4">{stato === "LIVE" ? "Pausa" : "Riprendi"}</button>
            </div>
          </>
        ) : (
          <p className="text-sm opacity-70">{stato === "LIVE" ? "Nessuna chiamata. Cerca sotto e tocca un nome." : `Asta in stato ${stato}.`}</p>
        )}
        {err && <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      </section>

      {stato === "LIVE" && (
      <>
      {/* RICERCA */}
      <section className="rounded border bg-white p-3">
        <input value={q} onChange={(e) => cerca(e.target.value)} placeholder="Digita 3+ lettere (nome o squadra)"
          className="min-h-[48px] w-full rounded border px-3 text-lg" />
        <ul>
          {ris.map((p) => (
            <li key={p.official_id}>
              <button disabled={busy} onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: p.official_id, expected: versione }))}
                className="mt-1 flex min-h-[48px] w-full items-center justify-between gap-2 rounded border px-3 text-left">
                <span><b>{p.nome}</b> <span className="opacity-60">· {p.squadra} · {p.ruolo}</span>
                  {p.titolare ? <span className="ml-1 rounded bg-green-100 px-1 text-xs">XI</span> : null}</span>
                <span className="text-sm opacity-70">Qt {p.qt ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* SQUADRA + PREZZO */}
      <section className="rounded border bg-white p-3">
        <p className="text-xs opacity-60">Acquirente (1° tocco)</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {managers.map((m) => (
            <button key={m.id} onClick={() => setTeam(m.id)}
              className={`min-h-[48px] rounded border px-2 text-left ${team === m.id ? "border-black bg-black text-white" : ""}`}>
              <b>{m.nome}</b> <span className="text-sm opacity-70">· {m.residui} · max {m.maxSpesa}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs opacity-60">Prezzo (tastierino)</p>
        <p className="text-3xl font-bold">{prezzo || "—"}</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {TASTI.map((t) => (
            <button key={t} onClick={() => digito(t)} className="min-h-[56px] rounded border text-xl font-bold">{t}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => setPrezzo((p) => String(Number(p || 0) + 1))} className="min-h-[44px] flex-1 rounded border">+1</button>
          <button onClick={() => setPrezzo((p) => String(Number(p || 0) + 5))} className="min-h-[44px] flex-1 rounded border">+5</button>
        </div>
      </section>
      </>
      )}

      {/* ROSE */}
      <section className="flex flex-col gap-2">
        {managers.map((m) => (
          <details key={m.id} className="rounded border bg-white p-3 text-sm">
            <summary className="min-h-[44px]"><b>{m.nome}</b> · residui <b>{m.residui}</b> ·
              P{m.slot.P.usati}/{m.slot.P.totali} D{m.slot.D.usati}/{m.slot.D.totali} C{m.slot.C.usati}/{m.slot.C.totali} A{m.slot.A.usati}/{m.slot.A.totali}</summary>
            <ul className="mt-1">
              {m.rosa.map((g, i) => <li key={i}>{g.nome} · {g.squadra} · {g.ruolo} · {g.prezzo}</li>)}
            </ul>
          </details>
        ))}
      </section>

      {/* RIEPILOGHI */}
      <section className="rounded border bg-white p-3 text-sm">
        <h2 className="font-bold">Più pagati</h2>
        <ol className="list-decimal pl-5">{topPagati.map((t, i) => <li key={i}>{t.nome} ({t.squadra}) → {t.chi} · {t.prezzo}</li>)}</ol>
        <h2 className="mt-3 font-bold">Migliori affari vs FVM/2</h2>
        <p className="text-xs opacity-60">PMA assente nei tuoi PDF: riferimento = FVM dimezzato.</p>
        <ol className="list-decimal pl-5">{affari.map((t, i) => <li key={i}>{t.nome} ({t.squadra}) → {t.chi} · {t.prezzo} (rif. {t.rif})</li>)}</ol>
      </section>
    </div>
  );
}
