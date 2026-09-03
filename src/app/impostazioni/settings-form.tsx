"use client";
import { useEffect, useState } from "react";

type Mgr = { nome: string; nome_squadra: string; note: string };

export default function SettingsForm({ editable, astaAperta }: { editable: boolean; astaAperta: boolean }) {
  const [mod, setMod] = useState("on");
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [custom, setCustom] = useState("");
  const [mgrs, setMgrs] = useState<Mgr[]>([]);
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState("");

  useEffect(() => {
    fetch("/api/league").then((r) => r.json()).then((j) => {
      if (j.ok) { setMgrs(j.data.managers); setMod(j.data.modificatore); }
    });
    fetch("/api/agent/models").then((r) => r.json()).then((j) => {
      if (j.ok) { setModels(j.data.models.map((m: { id: string }) => m.id)); setModel(j.data.default); }
    });
  }, []);

  async function salva(extra: object) {
    setMsg("");
    const r = await fetch("/api/league", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra) });
    const j = await r.json();
    setMsg(j.ok ? "Salvato." : `Errore: ${j.code ?? ""} ${j.message ?? ""}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {msg && <p className="rounded bg-zinc-100 p-2 text-sm">{msg}</p>}

      <section className="rounded border bg-white p-3">
        <h2 className="font-bold">Modificatore difesa</h2>
        <button onClick={() => { const v = mod === "on" ? "off" : "on"; setMod(v); salva({ modificatore: v }); }}
          className={`mt-2 min-h-[48px] w-full rounded font-bold ${mod === "on" ? "bg-black text-white" : "border"}`}>
          {mod === "on" ? "ATTIVO (tocca per spegnere)" : "SPENTO (tocca per attivare)"}
        </button>
        <p className="mt-1 text-xs opacity-60">Se spento, motore e chat smettono di privilegiare D/P.</p>
      </section>

      <section className="rounded border bg-white p-3">
        <h2 className="font-bold">Modello AI</h2>
        <div className="mt-2 flex gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="min-h-[48px] flex-1 rounded border px-2 text-base">
            {[model, ...models.filter((x) => x !== model)].filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ID manuale"
            className="min-h-[48px] w-32 rounded border px-2 text-base" />
        </div>
        <button onClick={async () => {
          const m = custom.trim() || model;
          await fetch("/api/agent/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m }) });
          setModel(m); setCustom(""); setMsg(`Modello attivo: ${m}`);
        }} className="mt-2 min-h-[48px] w-full rounded bg-black font-bold text-white">Usa subito</button>
      </section>

      <section className="rounded border bg-white p-3">
        <h2 className="font-bold">Partecipanti {editable ? "(modificabili: asta non avviata)" : "(bloccati: asta avviata)"}</h2>
        <div className="mt-2 flex flex-col gap-2">
          {mgrs.map((m, i) => (
            <div key={i} className="flex gap-2">
              <input value={m.nome} disabled={!editable} onChange={(e) => setMgrs(mgrs.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                placeholder="Nome" className="min-h-[48px] flex-1 rounded border px-2 text-base disabled:opacity-50" />
              <input value={m.nome_squadra} disabled={!editable} onChange={(e) => setMgrs(mgrs.map((x, j) => j === i ? { ...x, nome_squadra: e.target.value } : x))}
                placeholder="Squadra" className="min-h-[48px] flex-1 rounded border px-2 text-base disabled:opacity-50" />
            </div>
          ))}
        </div>
        {editable && <button onClick={() => salva({ managers: mgrs.map((m, i) => ({ ...m, is_owner: i === 0 })) })}
          className="mt-2 min-h-[48px] w-full rounded bg-black font-bold text-white">Salva partecipanti</button>}
      </section>

      <section className="rounded border bg-white p-3">
        <h2 className="font-bold">Dataset</h2>
        <button disabled={astaAperta} onClick={async () => {
          setLog("Import in corso…");
          const r = await fetch("/api/dataset/reimport", { method: "POST" });
          const j = await r.json();
          setLog(j.ok ? j.data.log : `Bloccato: ${j.message}`);
        }} className="mt-2 min-h-[48px] w-full rounded border disabled:opacity-40">
          Reimporta dataset {astaAperta ? "(vietato ad asta aperta)" : ""}</button>
        {log && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{log}</pre>}
      </section>

      <section className="rounded border border-red-300 bg-white p-3">
        <h2 className="font-bold text-red-700">Reset asta</h2>
        <button onClick={async () => {
          if (!confirm("Sicuro? Cancella sessione, eventi e acquisti.")) return;
          if (!confirm("Seconda conferma: davvero resettare tutto?")) return;
          const r = await fetch("/api/auction/reset", { method: "POST" });
          const j = await r.json();
          setMsg(j.ok ? "Asta resettata." : `Bloccato: ${j.message}`);
        }} className="mt-2 min-h-[48px] w-full rounded border border-red-500 text-red-700">Reset asta</button>
      </section>
    </div>
  );
}
