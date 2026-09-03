import type { LucideIcon } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ————— classi condivise ————— */

export const btnPrimary =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-ink px-4 font-semibold text-bg transition hover:bg-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export const btnGhost =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 font-medium text-ink transition hover:bg-panel2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export const btnDanger =
  "inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-4 font-medium text-danger transition hover:bg-danger/20 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export const inputCls =
  "min-h-[48px] w-full rounded-lg border border-line bg-panel2 px-3 text-base text-ink transition placeholder:text-faint focus:border-signal/60 focus:outline-none";

/* ————— tipografia ————— */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("eyebrow", className)}>{children}</p>;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("font-display text-lg font-extrabold uppercase tracking-tight", className)}>
      Rebu<span className="text-signal">AI</span>
    </span>
  );
}

/* ————— superfici ————— */

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cx("rounded-xl border border-line bg-panel p-4", className)}>{children}</section>;
}

export function PanelHead({ icon: Icon, title, hint }: { icon?: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      {Icon ? <Icon className="size-4 translate-y-0.5 text-signal" aria-hidden /> : null}
      <h2 className="font-display text-sm font-bold uppercase tracking-wide">{title}</h2>
      {hint ? <span className="font-mono text-[11px] text-faint">{hint}</span> : null}
    </div>
  );
}

/* ————— dati ————— */

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">{label}</p>
      <p className={cx("tnum mt-0.5 font-mono text-lg font-semibold", tone ?? "text-ink")}>{value}</p>
    </div>
  );
}

const ROLE_STYLE: Record<string, string> = {
  P: "border-p/40 bg-p/10 text-p",
  D: "border-d/40 bg-d/10 text-d",
  C: "border-c/40 bg-c/10 text-c",
  A: "border-a/40 bg-a/10 text-a",
};

export function RoleBadge({ r, className }: { r: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-mono text-[11px] font-semibold",
        ROLE_STYLE[r] ?? "border-line bg-panel2 text-muted",
        className
      )}
    >
      {r}
    </span>
  );
}

const STATO_STYLE: Record<string, { pill: string; dot: string }> = {
  LIVE: { pill: "border-signal/50 bg-signal/10 text-signal", dot: "animate-pulse-dot bg-signal" },
  PAUSA: { pill: "border-line bg-panel2 text-muted", dot: "bg-muted" },
  PRONTA: { pill: "border-d/40 bg-d/10 text-d", dot: "bg-d" },
  CONCLUSA: { pill: "border-line bg-panel2 text-faint", dot: "bg-faint" },
};

export function StatusPill({ stato }: { stato: string }) {
  const s = STATO_STYLE[stato] ?? STATO_STYLE.PAUSA;
  return (
    <span className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold tracking-wider", s.pill)}>
      <span className={cx("size-1.5 rounded-full", s.dot)} />
      {stato}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-panel/50 px-6 py-16 text-center">
      <Icon className="size-8 text-faint" aria-hidden />
      <h2 className="font-display text-lg font-bold uppercase">{title}</h2>
      {body ? <p className="max-w-sm text-sm text-muted">{body}</p> : null}
    </div>
  );
}

export function XIChip() {
  return (
    <span className="rounded border border-d/40 bg-d/10 px-1.5 py-px font-mono text-[10px] font-semibold text-d">XI</span>
  );
}
