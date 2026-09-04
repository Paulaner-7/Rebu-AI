"use client";
import { useEffect, useState } from "react";
import { Check, Cpu, DatabaseBackup, RefreshCw, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { btnDanger, btnGhost, btnPrimary, cx, inputCls, Panel, PanelHead } from "@/components/ui";

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
    <div className="flex flex-col gap-3">
      {msg && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-panel2 p-3 text-sm" role="status">
          <Check className="size-4 shrink-0 text-d" aria-hidden />
          {msg}
        </p>
      )}

      <Panel>
        <PanelHead icon={ShieldCheck} title="Modificatore difesa" />
        <button
          onClick={() => { const v = mod === "on" ? "off" : "on"; setMod(v); salva({ modificatore: v }); }}
          aria-pressed={mod === "on"}
          className="flex min-h-[48px] w-full cursor-pointer items-center justify-between rounded-lg border border-line bg-panel2 px-4 transition hover:border-faint"
        >
          <span className="font-medium">{mod === "on" ? "Attivo" : "Spento"}</span>
          <span className={cx("relative h-6 w-11 rounded-full transition", mod === "on" ? "bg-d" : "bg-line")}>
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-ink transition-all", mod === "on" ? "left-[22px]" : "left-0.5")} />
          </span>
        </button>
        <p className="mt-2 text-xs text-muted">Se spento, motore e chat smettono di privilegiare D/P.</p>
      </Panel>

      <Panel>
        <PanelHead icon={Cpu} title="Modello AI" />
        <div className="flex gap-2">
          <select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modello AI" className={cx(inputCls, "flex-1 font-mono text-sm")}>
            {[model, ...models.filter((x) => x !== model)].filter(Boolean).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ID manuale"
            aria-label="ID modello manuale" className={cx(inputCls, "w-32 font-mono text-sm")} />
        </div>
        <button onClick={async () => {
          const m = custom.trim() || model;
          await fetch("/api/agent/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: m }) });
          setModel(m); setCustom(""); setMsg(`Modello attivo: ${m}`);
        }} className={cx(btnPrimary, "mt-2 w-full")}>Usa subito</button>
      </Panel>

      <Panel>
        <PanelHead icon={Users} title="Partecipanti" hint={editable ? "modificabili: asta non avviata" : "bloccati: asta avviata"} />
        <div className="flex flex-col gap-2">
          {mgrs.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="tnum w-6 shrink-0 text-center font-mono text-xs font-semibold text-faint">{String(i + 1).padStart(2, "0")}</span>
              <input value={m.nome} disabled={!editable} onChange={(e) => setMgrs(mgrs.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                placeholder="Nome" aria-label={`Nome partecipante ${i + 1}`} className={cx(inputCls, "disabled:opacity-50")} />
              <input value={m.nome_squadra} disabled={!editable} onChange={(e) => setMgrs(mgrs.map((x, j) => j === i ? { ...x, nome_squadra: e.target.value } : x))}
                placeholder="Squadra" aria-label={`Squadra partecipante ${i + 1}`} className={cx(inputCls, "disabled:opacity-50")} />
            </div>
          ))}
        </div>
        {editable && (
          <button onClick={() => salva({ managers: mgrs.map((m, i) => ({ ...m, is_owner: i === 0 })) })}
            className={cx(btnPrimary, "mt-3 w-full")}>Salva partecipanti</button>
        )}
      </Panel>

      <Panel>
        <PanelHead icon={DatabaseBackup} title="Backup emergenza" hint="rose+eventi+preferenze+impostazioni" />
        <div className="flex gap-2">
          <a href="/api/backup" className={cx(btnGhost, "flex-1")}>Scarica JSON</a>
          <label className={cx(btnGhost, "flex-1")}>
            Ripristina
            <input type="file" accept=".json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (!confirm("Ripristinare backup? Asta corrente sostituita (vietato in LIVE/PAUSA).")) return;
              const r = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: await f.text() });
              const j = await r.json();
              setMsg(j.ok ? `Ripristinato in PAUSA: verifica e riprendi.` : `Bloccato: ${j.message}`);
            }} />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">Se telefono/PC muore: ripristina da altro dispositivo, verifica rose, riprendi.</p>
      </Panel>

      <Panel>
        <PanelHead icon={RefreshCw} title="Dataset" />
        <button disabled={astaAperta} onClick={async () => {
          setLog("Import in corso…");
          const r = await fetch("/api/dataset/reimport", { method: "POST" });
          const j = await r.json();
          setLog(j.ok ? j.data.log : `Bloccato: ${j.message}`);
        }} className={cx(btnGhost, "w-full")}>
          Reimporta dataset {astaAperta ? "(vietato ad asta aperta)" : ""}
        </button>
        {log && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg p-3 font-mono text-xs text-muted">{log}</pre>}
      </Panel>

      <Panel className="border-danger/30">
        <PanelHead icon={TriangleAlert} title="Zona pericolosa" />
        <button onClick={async () => {
          if (!confirm("Sicuro? Cancella sessione, eventi e acquisti.")) return;
          if (!confirm("Seconda conferma: davvero resettare tutto?")) return;
          const r = await fetch("/api/auction/reset", { method: "POST" });
          const j = await r.json();
          setMsg(j.ok ? "Asta resettata." : `Bloccato: ${j.message}`);
        }} className={cx(btnDanger, "w-full")}>Reset asta</button>
      </Panel>
    </div>
  );
}
