"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleStop, Gavel, Pause, Play, TriangleAlert, Undo2, Users } from "lucide-react";
import { btnDanger, btnGhost, btnPrimary, cx, inputCls, Panel, PanelHead } from "@/components/ui";

async function post(path: string, body: object) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.code ? `${j.code}: ${j.message}` : "Errore");
  return j.data;
}

type Props = {
  sid: number | null;
  versione: number;
  stato: string;
  managers: { id: number; nome: string }[];
  defaults: { nome: string; nome_squadra: string; note: string }[];
};

export default function Console({ sid, versione, stato, managers, defaults }: Props) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [names, setNames] = useState<string[]>(defaults.map((d) => d.nome));
  const [oid, setOid] = useState("");
  const [mid, setMid] = useState("");
  const [prezzo, setPrezzo] = useState("");

  async function go(fn: () => Promise<unknown>) {
    setErr("");
    try { await fn(); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Errore"); }
  }
  const idem = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      {err && (
        <p className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {err}
        </p>
      )}
      {sid === null ? (
        <Panel>
          <PanelHead icon={Users} title="Setup 8 squadre" hint="8 nomi" />
          <div className="flex flex-col gap-2">
            {names.map((n, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="tnum w-6 shrink-0 text-center font-mono text-xs font-semibold text-faint">{String(i + 1).padStart(2, "0")}</span>
                <input
                  value={n}
                  onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
                  className={inputCls}
                  placeholder={`Partecipante ${i + 1}`}
                  aria-label={`Partecipante ${i + 1}`}
                />
              </div>
            ))}
            <button
              className={cx(btnPrimary, "mt-2 w-full")}
              onClick={() => go(async () => post("/api/auction/setup", {
                managers: names.map((nome, i) => ({ nome, nome_squadra: defaults[i]?.nome_squadra ?? "", note: "", is_owner: i === 0 })),
              }))}
            >
              <Gavel className="size-4" aria-hidden />
              Prepara asta
            </button>
          </div>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {stato === "PRONTA" && (
              <button className={btnPrimary}
                onClick={() => go(() => post("/api/auction/start", { sessionId: sid, expected: versione }))}>
                <Play className="size-4" aria-hidden />
                Avvia (congela dataset)
              </button>
            )}
            {stato === "LIVE" && (
              <button className={btnGhost}
                onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: "pause", expected: versione }))}>
                <Pause className="size-4" aria-hidden />
                Pausa
              </button>
            )}
            {stato === "PAUSA" && (
              <button className={btnGhost}
                onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: "resume", expected: versione }))}>
                <Play className="size-4" aria-hidden />
                Riprendi
              </button>
            )}
            {(stato === "LIVE" || stato === "PAUSA") && (
              <>
                <button className={btnGhost}
                  onClick={() => go(() => post("/api/auction/undo", { sessionId: sid, expected: versione }))}>
                  <Undo2 className="size-4" aria-hidden />
                  Annulla ultima
                </button>
                <button className={btnDanger}
                  onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: "complete", expected: versione }))}>
                  <CircleStop className="size-4" aria-hidden />
                  Concludi
                </button>
              </>
            )}
          </div>
          {stato === "LIVE" && (
            <Panel>
              <PanelHead icon={Gavel} title="Nomina" hint="ID listone" />
              <div className="flex gap-2">
                <input value={oid} onChange={(e) => setOid(e.target.value)} inputMode="numeric" placeholder="es. 5841"
                  aria-label="ID ufficiale giocatore" className={inputCls} />
                <button className={btnPrimary}
                  onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: Number(oid), expected: versione }))}>Nomina</button>
                <button className={btnGhost}
                  onClick={() => go(() => post("/api/auction/unsold", { sessionId: sid, officialId: Number(oid), expected: versione }))}>Invenduto</button>
              </div>
              <h2 className="font-display mt-5 text-sm font-bold uppercase tracking-wide">Vendi nominato</h2>
              <div className="mt-2 flex gap-2">
                <select value={mid} onChange={(e) => setMid(e.target.value)} aria-label="Squadra acquirente" className={cx(inputCls, "flex-1")}>
                  <option value="">Squadra…</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <input value={prezzo} onChange={(e) => setPrezzo(e.target.value)} inputMode="numeric" placeholder="Prezzo"
                  aria-label="Prezzo" className={cx(inputCls, "w-24")} />
                <button className={btnPrimary}
                  onClick={() => go(() => post("/api/auction/sell", {
                    sessionId: sid, officialId: Number(oid), managerId: Number(mid), prezzo: Number(prezzo), idem: idem(), expected: versione,
                  }))}>Vendi</button>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
