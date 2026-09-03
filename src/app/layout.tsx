import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rebu AI",
  description: "Assistente asta Fantacalcio Serie A 2026/27",
};

const MENU = [
  { href: "/", label: "Home" },
  { href: "/asta", label: "Asta" },
  { href: "/giocatori", label: "Giocatori" },
  { href: "/rose", label: "Rose" },
  { href: "/chat", label: "Chat" },
  { href: "/impostazioni", label: "Impostazioni" },
  { href: "/stagione", label: "Stagione" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <header className="sticky top-0 z-10 border-b bg-white">
          <nav className="mx-auto flex w-full max-w-3xl items-center gap-1 overflow-x-auto p-2">
            <span className="mr-2 shrink-0 px-1 text-lg font-bold">Rebu AI</span>
            {MENU.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="min-h-[44px] shrink-0 rounded px-3 py-2 text-sm font-medium hover:bg-zinc-100"
              >
                {m.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="mx-auto w-full max-w-3xl p-4">{children}</div>
      </body>
    </html>
  );
}
