"use client";
import { useEffect, useState } from "react";
import type { Contract } from "@/lib/agent";

type Msg = { chi: "io" | "rebu"; testo: string; contract?: Contract | null; via?: string; model?: string };

export default function ChatBox() {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [custom, setCustom] = useState("");
  const [configured, setConfigured] = useState(false);
  const [domanda, setDomanda] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/agent/models").then((r) => r.json()).then((j) => {
      if (j.ok) { setModels(j.data.models.map((m: { id: string }) => m.id)); setModel(j.data.default); setConfigured(j.data.configured); }
    });
  }, []);

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (!domanda.trim() || busy) return;
    const d = domanda; setDomanda(""); setBusy(true);
    setMsgs((m) => [...m, { chi: "io", testo: d }]);
    try {
      const mdl = custom.trim() || model;
      const r = await fetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domanda: d, model: mdl }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.message);
      if (custom.trim()) { fetch("/api/agent/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: custom.trim() }) }); setModel(custom.trim()); }
      setMsgs((m) => [...m, { chi: "rebu", testo: j.data.testo, contract: j.data.contract, via: j.data.via, model: j.data.model }]);
    } catch (err) {
      setMsgs((m) => [...m, { chi: "rebu", testo: `Errore: ${err instanceof Error ? err.message : "?"}` }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border bg-white p-3 text-sm">
        <label className="opacity-60">Modello {configured ? "" : "(chiave non impostata: risponde il motore)"}</label>
        <div className="mt-1 flex gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} className="min-h-[44px] flex-1 rounded border px-2 text-base">
            {[model, ...models.filter((x) => x !== model)].filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="o ID manuale"
            className="min-h-[44px] w-32 rounded border px-2 text-base" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {msgs.map((m, i) => (
          <div key={i} className={`rounded border p-3 text-sm ${m.chi === "io" ? "bg-zinc-100" : "bg-white"}`}>
            <p className="whitespace-pre-wrap">{m.testo}</p>
            {m.contract && (
              <div className="mt-2 rounded bg-zinc-50 p-2 text-sm">
                <p><b>{m.contract.azione}</b> fino a <b>{m.contract.prezzoMassimoConsigliato}</b> · {m.contract.confidenza}</p>
                <ul className="list-disc pl-5">{m.contract.motivazioni.map((x, k) => <li key={k}>{x}</li>)}</ul>
                {m.contract.alternative.length > 0 && <p className="opacity-70">Alternative: {m.contract.alternative.join(", ")}</p>}
                <p className="text-xs opacity-50">Fonti: {m.contract.fonti.join(", ")} · via {m.via} · {m.model}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={invia} className="flex gap-2">
        <input value={domanda} onChange={(e) => setDomanda(e.target.value)} placeholder="Chiedi (es. Malen fino a quanto?)"
          className="min-h-[48px] flex-1 rounded border px-3 text-base" />
        <button disabled={busy} className="min-h-[48px] rounded bg-black px-5 font-bold text-white disabled:opacity-40">→</button>
      </form>
    </div>
  );
}
