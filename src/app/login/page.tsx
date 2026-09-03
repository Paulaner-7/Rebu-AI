"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LockKeyhole, TriangleAlert } from "lucide-react";
import { btnPrimary, cx, inputCls, Wordmark } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (r.ok) router.push("/");
    else setErr("Codice errato. Riprova.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 p-6">
      <div>
        <Wordmark className="text-2xl" />
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Serie A · 2026/27</p>
        <p className="mt-4 text-sm text-muted">Accesso privato. Inserisci il codice della lega.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="password"
            inputMode="text"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Codice accesso"
            aria-label="Codice accesso"
            className={cx(inputCls, "pl-9")}
          />
        </div>
        <button type="submit" className={btnPrimary}>Entra</button>
      </form>
      {err && (
        <p className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger" role="alert">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {err}
        </p>
      )}
    </main>
  );
}
