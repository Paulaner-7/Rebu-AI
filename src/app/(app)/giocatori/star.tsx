"use client";
import { useState } from "react";
import { Ban, Star as StarIcon } from "lucide-react";
import { cx } from "@/components/ui";

const BTN =
  "flex size-11 cursor-pointer items-center justify-center rounded-lg border transition active:scale-95";

export default function Star({ officialId, stato }: { officialId: number; stato: "W" | "X" | null }) {
  const [s, setS] = useState(stato);
  async function set(t: "W" | "X" | null) {
    await fetch("/api/preferenze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officialId, tipo: t }) });
    setS(t);
  }
  return (
    <span className="flex shrink-0 gap-1.5">
      <button
        title="Pupillo"
        aria-label="Segna come pupillo"
        aria-pressed={s === "W"}
        onClick={() => set(s === "W" ? null : "W")}
        className={cx(BTN, s === "W" ? "border-signal/50 bg-signal/10 text-signal" : "border-line text-faint hover:text-muted")}
      >
        <StarIcon className={cx("size-4", s === "W" && "fill-signal")} aria-hidden />
      </button>
      <button
        title="Escluso"
        aria-label="Segna come escluso"
        aria-pressed={s === "X"}
        onClick={() => set(s === "X" ? null : "X")}
        className={cx(BTN, s === "X" ? "border-danger/50 bg-danger/10 text-danger" : "border-line text-faint hover:text-muted")}
      >
        <Ban className="size-4" aria-hidden />
      </button>
    </span>
  );
}
