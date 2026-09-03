import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const MENU = [
  { href: "/", label: "Home" },
  { href: "/asta", label: "Asta" },
  { href: "/giocatori", label: "Giocatori" },
  { href: "/rose", label: "Rose" },
  { href: "/chat", label: "Chat" },
  { href: "/impostazioni", label: "Impostazioni" },
  { href: "/stagione", label: "Stagione" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySession(token))) redirect("/login");
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-white">
        <nav className="mx-auto flex w-full max-w-3xl items-center gap-1 overflow-x-auto p-2">
          <span className="mr-2 shrink-0 px-1 text-lg font-bold">Rebu AI</span>
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="min-h-[44px] shrink-0 rounded px-3 py-2 text-sm font-medium hover:bg-zinc-100">
              {m.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto w-full max-w-3xl p-4">{children}</div>
    </>
  );
}
