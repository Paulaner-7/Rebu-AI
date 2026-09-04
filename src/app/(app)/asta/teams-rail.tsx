"use client";
import { ChevronDown } from "lucide-react";
import { cx, RoleBadge } from "@/components/ui";
import type { Mgr } from "./live";

const RUOLI = ["P", "D", "C", "A"] as const;
const ROLE_TXT: Record<string, string> = { P: "text-p", D: "text-d", C: "text-c", A: "text-a" };

export default function TeamsRail({ managers, ownerNome }: { managers: Mgr[]; ownerNome: string }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Squadre avversarie">
      <p className="eyebrow px-1">Squadre</p>
      {managers.map((m) => {
        const isOwner = m.nome === ownerNome;
        const totAll = RUOLI.reduce((a, r) => a + (m.slot[r]?.totali ?? 0), 0);
        return (
          <details
            key={m.id}
            open={isOwner}
            className={cx(
              "group overflow-hidden rounded-xl border bg-panel",
              isOwner ? "border-signal/40" : "border-line"
            )}
          >
            <summary className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={cx(
                  "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold",
                  isOwner ? "bg-signal text-bg" : "bg-panel2 text-muted"
                )}
                aria-hidden
              >
                {m.nome.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm leading-tight">
                  {m.nome}
                  {isOwner && (
                    <span className="ml-1.5 rounded bg-signal/15 px-1.5 py-px font-mono text-[10px] font-bold uppercase text-signal">
                      Tu
                    </span>
                  )}
                </b>
                <span className="mt-0.5 flex gap-2 font-mono text-[11px] text-muted">
                  {RUOLI.map((r) => (
                    <span key={r} className="tnum">
                      <span className={cx("font-bold", ROLE_TXT[r])}>{r}</span>{" "}
                      {m.slot[r]?.usati ?? 0}/{m.slot[r]?.totali ?? 0}
                    </span>
                  ))}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tnum block font-mono text-base font-bold leading-none text-signal">
                  {m.residui}
                </span>
                <span className="tnum mt-1 block font-mono text-[10px] text-faint">
                  max {m.maxSpesa}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-faint transition group-open:rotate-180" aria-hidden />
            </summary>

            {/* barra avanzamento rosa */}
            <div className="mx-3 mb-2 flex h-1 overflow-hidden rounded-full bg-panel2" aria-hidden>
              {RUOLI.map((r) => {
                const u = m.slot[r]?.usati ?? 0;
                const t = m.slot[r]?.totali ?? 1;
                const w = totAll ? (t / totAll) * 100 : 0;
                const fill = t ? u / t : 0;
                const bg = { P: "bg-p", D: "bg-d", C: "bg-c", A: "bg-a" }[r];
                return (
                  <span key={r} style={{ width: `${w}%` }} className="relative h-full bg-transparent">
                    <span
                      style={{ width: `${Math.min(100, fill * 100)}%` }}
                      className={cx("absolute inset-y-0 left-0", bg)}
                    />
                  </span>
                );
              })}
            </div>

            <ul className="border-t border-line px-3 py-1">
              {m.rosa.length === 0 && (
                <li className="py-2 text-[13px] text-faint">—</li>
              )}
              {m.rosa.map((g, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 border-b border-line/50 py-[7px] text-[13px] last:border-0"
                >
                  <RoleBadge r={g.ruolo} />
                  <span className="min-w-0 flex-1 truncate">
                    {g.nome} <span className="text-faint">· {g.squadra}</span>
                  </span>
                  <span className="tnum font-mono text-xs text-muted">{g.prezzo}</span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
