"use client";
import { useState } from "react";

export default function Star({ officialId, stato }: { officialId: number; stato: "W" | "X" | null }) {
  const [s, setS] = useState(stato);
  async function set(t: "W" | "X" | null) {
    await fetch("/api/preferenze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officialId, tipo: t }) });
    setS(t);
  }
  return (
    <span className="flex gap-1">
      <button title="Pupillo" onClick={() => set(s === "W" ? null : "W")}
        className={`min-h-[44px] min-w-[44px] rounded border text-lg ${s === "W" ? "bg-yellow-300" : "opacity-40"}`}>★</button>
      <button title="Escluso" onClick={() => set(s === "X" ? null : "X")}
        className={`min-h-[44px] min-w-[44px] rounded border text-lg ${s === "X" ? "bg-red-300" : "opacity-40"}`}>✗</button>
    </span>
  );
}
