"use client";
import { useEffect, useRef, useState } from "react";
import { Cpu, SendHorizontal } from "lucide-react";
import type { Contract } from "@/lib/agent";
import { btnPrimary, cx, inputCls, Panel } from "@/components/ui";

type Msg = { chi: "io" | "rebu"; testo: string; contract?: Contract | null; via?: string; model?: string };

export default function ChatBox() {
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState("");
  const [custom, setCustom] = useState("");
  const [configured, setConfigured] = useState(false);
  const [domanda, setDomanda] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/agent/models").then((r) => r.json()).then((j) => {
      if (j.ok) { setModels(j.data.models.map((m: { id: string }) => m.id)); setModel(j.data.default); setConfigured(j.data.configured); }
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, busy]);

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
      <Panel className="py-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 shrink-0 text-signal" aria-hidden />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Modello AI"
            className="min-h-[44px] flex-1 rounded-lg border border-line bg-panel2 px-2 font-mono text-sm text-ink focus:border-signal/60 focus:outline-none"
          >
            {[model, ...models.filter((x) => x !== model)].filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="ID manuale"
            aria-label="ID modello manuale"
            className="min-h-[44px] w-32 rounded-lg border border-line bg-panel2 px-2 font-mono text-sm text-ink placeholder:text-faint focus:border-signal/60 focus:outline-none"
          />
        </div>
        {!configured && <p className="mt-2 font-mono text-[11px] text-faint">Chiave non impostata: risponde il motore.</p>}
      </Panel>

      <div className="flex flex-col gap-2" aria-live="polite">
        {msgs.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            Chiedi al motore: prezzi, tetti, strategie per reparto.
          </p>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={cx(
              "max-w-[92%] rounded-xl border p-3 text-sm sm:max-w-[80%]",
              m.chi === "io" ? "self-end border-line bg-panel2" : "self-start border-line bg-panel"
            )}
          >
            <p className={cx("eyebrow mb-1", m.chi === "io" && "text-right")}>{m.chi === "io" ? "Tu" : "Rebu"}</p>
            <p className="whitespace-pre-wrap leading-relaxed">{m.testo}</p>
            {m.contract && (
              <div className="mt-3 rounded-lg border border-signal/25 bg-signal/5 p-3">
                <p className="text-sm">
                  <b>{m.contract.azione}</b> fino a{" "}
                  <span className="tnum font-mono text-lg font-semibold text-signal">{m.contract.prezzoMassimoConsigliato}</span>{" "}
                  <span className="font-mono text-[11px] uppercase tracking-wider text-faint">· {m.contract.confidenza}</span>
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
                  {m.contract.motivazioni.map((x, k) => (
                    <li key={k} className="flex gap-2">
                      <span className="tnum shrink-0 font-mono text-[11px] text-signal">{String(k + 1).padStart(2, "0")}</span>
                      {x}
                    </li>
                  ))}
                </ul>
                {m.contract.alternative.length > 0 && (
                  <p className="mt-2 text-sm text-muted">Alternative: {m.contract.alternative.join(", ")}</p>
                )}
                <p className="mt-2 font-mono text-[10px] text-faint">Fonti: {m.contract.fonti.join(", ")} · via {m.via} · {m.model}</p>
              </div>
            )}
          </div>
        ))}
        {busy && <p className="eyebrow self-start">Rebu sta pensando…</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={invia} className="flex gap-2">
        <input
          value={domanda}
          onChange={(e) => setDomanda(e.target.value)}
          placeholder="Chiedi (es. Malen fino a quanto?)"
          aria-label="Domanda per l'assistente"
          className={cx(inputCls, "flex-1")}
        />
        <button disabled={busy} aria-label="Invia" className={cx(btnPrimary, "w-12 shrink-0 px-0")}>
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
