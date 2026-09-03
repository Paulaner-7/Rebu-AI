import { getDbStatus } from "@/lib/db";
import { getEnvChecklist } from "@/lib/env";
import { DATASET_META } from "@/lib/dataset-meta";

export default function Home() {
  const db = getDbStatus();
  const env = getEnvChecklist();
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Rebu AI</h1>
      <p className="text-sm opacity-70">
        Assistente asta Fantacalcio Serie A 2026/27. Lega 8 · 500 crediti · 3P/8D/8C/6A · per reparti P→D→C→A.
      </p>
      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Stato Fase 1</h2>
        <ul className="mt-2 text-sm">
          <li>DB provider: <b>{db.provider}</b></li>
          <li>{db.note}</li>
        </ul>
      </section>
      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Dataset verificato (cartella dati/)</h2>
        <ul className="mt-2 text-sm">
          <li>Listone: {DATASET_META.listone.tutti} giocatori + {DATASET_META.listone.ceduti} ceduti · {DATASET_META.listone.squadre} squadre</li>
          <li>Guida: XI {DATASET_META.guida.titolariXI} · ballottaggi {DATASET_META.guida.ballottaggi} · piazzati {DATASET_META.guida.piazzati} · griglia {DATASET_META.guida.griglia}</li>
          <li>Storiche: 22/23 ({DATASET_META.storiche["2022/23"]}) · 23/24 ({DATASET_META.storiche["2023/24"]}) · 24/25 ({DATASET_META.storiche["2024/25"]}) · 25/26 ({DATASET_META.storiche["2025/26"]})</li>
        </ul>
      </section>
      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Env</h2>
        <ul className="mt-2 text-sm">
          {env.map((e) => (
            <li key={e.key}>{e.ok ? "✅" : "⬜"} {e.key} <span className="opacity-60">({e.neededFrom})</span></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
