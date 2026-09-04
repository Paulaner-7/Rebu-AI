"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarRange,
  Gavel,
  Home,
  Menu,
  MessagesSquare,
  Settings,
  Shirt,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cx, Wordmark } from "./ui";

type Item = { href: string; label: string; icon: LucideIcon };

const ITEMS: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/asta", label: "Asta", icon: Gavel },
  { href: "/giocatori", label: "Giocatori", icon: Users },
  { href: "/rose", label: "Rose", icon: Shirt },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/stagione", label: "Stagione", icon: CalendarRange },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

const TABS: Item[] = ITEMS.filter((i) => ["/", "/asta", "/giocatori", "/chat"].includes(i.href));
const MORE: Item[] = ITEMS.filter((i) => ["/rose", "/stagione", "/impostazioni"].includes(i.href));

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ——— rail desktop ——— */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-bg lg:flex">
        <Link href="/" className="block px-5 py-6">
          <Wordmark />
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Serie A · 2026/27</p>
        </Link>
        <nav className="flex flex-col gap-1 px-3" aria-label="Principale">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                  active ? "bg-panel2 text-ink" : "text-muted hover:bg-panel hover:text-ink"
                )}
              >
                <item.icon className={cx("size-[18px]", active && "text-signal")} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-auto px-5 py-5 font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
          Lega 8 · 500 crediti
          <br />
          3P · 8D · 8C · 6A
        </p>
      </aside>

      {/* ——— barra superiore mobile ——— */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" aria-label="Home">
            <Wordmark />
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">26/27</span>
        </div>
      </header>

      {/* ——— tab bar mobile ——— */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/92 backdrop-blur lg:hidden"
        aria-label="Principale"
      >
        <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide transition",
                  active ? "text-signal" : "text-muted active:text-ink"
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => setOpen(true)}
            aria-label="Altre sezioni"
            className={cx(
              "flex min-h-[56px] cursor-pointer flex-col items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide transition",
              MORE.some((i) => isActive(pathname, i.href)) ? "text-signal" : "text-muted active:text-ink"
            )}
          >
            <Menu className="size-5" aria-hidden />
            Altro
          </button>
        </div>
      </nav>

      {/* ——— sheet "Altro" ——— */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Altre sezioni">
          <button aria-label="Chiudi" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="eyebrow">Sezioni</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="Chiudi"
                className="flex size-11 cursor-pointer items-center justify-center rounded-lg border border-line text-muted transition hover:bg-panel2"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {MORE.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-base font-medium transition",
                      active ? "bg-panel2 text-ink" : "text-muted hover:bg-panel2 hover:text-ink"
                    )}
                  >
                    <item.icon className={cx("size-5", active && "text-signal")} aria-hidden />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
