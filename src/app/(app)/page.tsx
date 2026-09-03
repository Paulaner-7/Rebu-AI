import Link from "next/link";
import { ArrowRight, Check, Database, FileSpreadsheet, Gavel, KeyRound, MessagesSquare, Search, X } from "lucide-react";
import { getDbStatus } from "@/lib/db";
import { getEnvChecklist } from "@/lib/env";
import { DATASET_META } from "@/lib/dataset-meta";
import { Eyebrow, Panel, PanelHead, cx } from "@/components/ui";

const QUICK = [
  { href: "/asta", icon: Gavel, title: "Asta live", desc: "Chiamate, vendite e consigli del motore in tempo reale." },
  { href: "/giocatori", icon: Search, title: "Giocatori", desc: "Listone completo: quotazioni, FVM, titolarità." },
  { href: "/chat", icon: MessagesSquare, title: "Chat", desc: "Interroga l'assistente su prezzi e strategie." },
];

export default function Home() {
  const db = getDbStatus();
  const env = getEnvChecklist();
  const m = DATASET_META;

  return (
    <main className="flex flex-col gap-6">
      <header>
        <Eyebrow>Fantacalcio · Serie A 2026/27</Eyebrow>
        <h1 className="font-display mt-2 text-4xl font-extrabold uppercase leading-none tracking-tight sm:text-5xl">
          Cruscotto
        </h1>
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] text-muted">
          {["Lega 8", "500 crediti", "3P · 8D · 8C · 6A", "Reparti P→D→C→A"].map((c) => (
            <span key={c} className="rounded border border-line bg-panel px-2 py-1">{c}</span>
          ))}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group rounded-xl border border-line bg-panel p-4 transition hover:border-faint hover:bg-panel2"
          >
            <q.icon className="size-5 text-signal" aria-hidden />
            <p className="font-display mt-3 font-bold uppercase tracking-wide">{q.title}</p>
            <p className="mt-1 text-sm text-muted">{q.desc}</p>
            <p className="mt-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-faint transition group-hover:text-signal">
              Apri <ArrowRight className="size-3.5" aria-hidden />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel>
          <PanelHead icon={Database} title="Database" />
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Provider</dt>
              <dd className="font-mono font-semibold">{db.provider}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Nota</dt>
              <dd className="text-right text-muted">{db.note}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <PanelHead icon={FileSpreadsheet} title="Dataset" hint="cartella dati/" />
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Listone</dt>
              <dd className="tnum font-mono font-semibold">{m.listone.tutti} <span className="text-faint">+{m.listone.ceduti} ceduti · {m.listone.squadre} sq.</span></dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Guida</dt>
              <dd className="tnum font-mono">{m.guida.titolariXI} XI · {m.guida.ballottaggi} ball. · {m.guida.piazzati} piazz.</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">Storiche</dt>
              <dd className="tnum font-mono">{m.storiche["2022/23"]} · {m.storiche["2023/24"]} · {m.storiche["2024/25"]} · {m.storiche["2025/26"]}</dd>
            </div>
          </dl>
        </Panel>

        <Panel className="sm:col-span-2">
          <PanelHead icon={KeyRound} title="Variabili ambiente" />
          <ul className="grid gap-2 sm:grid-cols-2">
            {env.map((e) => (
              <li key={e.key} className="flex items-center gap-3 rounded-lg border border-line bg-panel2 px-3 py-2.5">
                <span
                  className={cx(
                    "flex size-6 shrink-0 items-center justify-center rounded-full",
                    e.ok ? "bg-d/15 text-d" : "bg-danger/10 text-danger"
                  )}
                >
                  {e.ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold">{e.key}</p>
                  <p className="font-mono text-[10px] text-faint">{e.neededFrom}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </main>
  );
}
