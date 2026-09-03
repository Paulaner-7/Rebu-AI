"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    else setErr("Codice errato.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">Rebu AI</h1>
      <p className="text-sm opacity-70">Accesso privato. Inserisci codice.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          inputMode="text"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Codice accesso"
          className="min-h-[44px] rounded border border-gray-300 bg-white px-3 text-base text-black"
        />
        <button type="submit" className="min-h-[44px] rounded bg-black px-3 text-base font-semibold text-white">
          Entra
        </button>
      </form>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </main>
  );
}
