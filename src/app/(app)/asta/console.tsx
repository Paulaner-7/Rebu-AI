"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      {sid === null ? (
        <div className="flex flex-col gap-2 rounded border bg-white p-3">
          <h2 className="font-semibold">Setup 8 squadre (nomi compilabili sul posto)</h2>
          {names.map((n, i) => (
            <input key={i} value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
              className="min-h-[44px] rounded border px-3 text-base" placeholder={`Partecipante ${i + 1}`} />
          ))}
          <button className="min-h-[44px] rounded bg-black font-semibold text-white"
            onClick={() => go(async () => post("/api/auction/setup", {
              managers: names.map((nome, i) => ({ nome, nome_squadra: defaults[i]?.nome_squadra ?? "", note: "", is_owner: i === 0 })),
            }))}>Prepara asta</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {stato === "PRONTA" && (
              <button className="min-h-[44px] rounded bg-black px-4 font-semibold text-white"
                onClick={() => go(() => post("/api/auction/start", { sessionId: sid, expected: versione }))}>
                Avvia (congela dataset)</button>
            )}
            {stato === "LIVE" && (
              <button className="min-h-[44px] rounded border px-4"
                onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: "pause", expected: versione }))}>Pausa</button>
            )}
            {stato === "PAUSA" && (
              <button className="min-h-[44px] rounded border px-4"
                onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: "resume", expected: versione }))}>Riprendi</button>
            )}
            {(stato === "LIVE" || stato === "PAUSA") && (
              <>
                <button className="min-h-[44px] rounded border px-4"
                  onClick={() => go(() => post("/api/auction/undo", { sessionId: sid, expected: versione }))}>Annulla ultima</button>
                <button className="min-h-[44px] rounded border border-red-400 px-4 text-red-700"
                  onClick={() => go(() => post("/api/auction/control", { sessionId: sid, action: "complete", expected: versione }))}>Concludi</button>
              </>
            )}
          </div>
          {stato === "LIVE" && (
            <div className="flex flex-col gap-2 rounded border bg-white p-3">
              <h2 className="font-semibold">Nomina (Id ufficiale listone)</h2>
              <div className="flex gap-2">
                <input value={oid} onChange={(e) => setOid(e.target.value)} inputMode="numeric" placeholder="es. 5841"
                  className="min-h-[44px] flex-1 rounded border px-3 text-base" />
                <button className="min-h-[44px] rounded bg-black px-4 font-semibold text-white"
                  onClick={() => go(() => post("/api/auction/nominate", { sessionId: sid, officialId: Number(oid), expected: versione }))}>Nomina</button>
                <button className="min-h-[44px] rounded border px-4"
                  onClick={() => go(() => post("/api/auction/unsold", { sessionId: sid, officialId: Number(oid), expected: versione }))}>Invenduto</button>
              </div>
              <h2 className="font-semibold">Vendi nominato</h2>
              <div className="flex gap-2">
                <select value={mid} onChange={(e) => setMid(e.target.value)} className="min-h-[44px] flex-1 rounded border px-2 text-base">
                  <option value="">Squadra…</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
                <input value={prezzo} onChange={(e) => setPrezzo(e.target.value)} inputMode="numeric" placeholder="Prezzo"
                  className="min-h-[44px] w-24 rounded border px-3 text-base" />
                <button className="min-h-[44px] rounded bg-black px-4 font-semibold text-white"
                  onClick={() => go(() => post("/api/auction/sell", {
                    sessionId: sid, officialId: Number(oid), managerId: Number(mid), prezzo: Number(prezzo), idem: idem(), expected: versione,
                  }))}>Vendi</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
