import { getDbStatus } from "@/lib/db";
import { getEnvChecklist } from "@/lib/env";

export default function Page() {
  const db = getDbStatus();
  const env = getEnvChecklist();
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Impostazioni</h1>
      <section className="rounded border bg-white p-4 text-sm">
        <h2 className="font-semibold">Provider DB: {db.provider}</h2>
        <p className="opacity-70">{db.note}</p>
      </section>
      <section className="rounded border bg-white p-4 text-sm">
        <h2 className="font-semibold">Env</h2>
        <ul className="mt-2">
          {env.map((e) => (
            <li key={e.key}>{e.ok ? "✅" : "⬜"} {e.key} <span className="opacity-60">({e.neededFrom})</span></li>
          ))}
        </ul>
      </section>
      <p className="text-sm opacity-70">Selettore modello AI arriva in Fase 5.</p>
    </main>
  );
}
