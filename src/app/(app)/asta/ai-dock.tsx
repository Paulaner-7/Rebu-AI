"use client";
import { useState } from "react";
import { Cpu, X } from "lucide-react";
import ChatBox from "../chat/chatbox";

export default function AiDock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* destra desktop: rail chat sticky stile Sofascore */}
      <aside className="hidden max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-panel xl:sticky xl:top-4 xl:flex" aria-label="Finestra AI">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-signal" />
          </span>
          <Cpu className="size-4 text-signal" aria-hidden />
          <p className="font-display text-sm font-bold uppercase tracking-wide">Rebu AI</p>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-faint">live</span>
        </div>
        <div className="overflow-y-auto p-3">
          <ChatBox compact />
        </div>
      </aside>
      {/* mobile + tablet: FAB */}
      <div className="xl:hidden">
        {!open && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Apri finestra AI"
            className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 flex min-h-[56px] items-center gap-2 rounded-full bg-signal px-5 font-semibold text-bg shadow-lg transition active:scale-95 lg:bottom-6"
          >
            <Cpu className="size-5" aria-hidden />
            Chiedi a Rebu
          </button>
        )}
        {open && (
          <div className="fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col rounded-t-2xl border border-line bg-panel shadow-2xl" role="dialog" aria-label="Finestra AI">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Cpu className="size-4 text-signal" aria-hidden />
              <p className="font-display text-sm font-bold uppercase tracking-wide">Rebu AI</p>
              <button onClick={() => setOpen(false)} aria-label="Chiudi finestra AI" className="ml-auto rounded-lg border border-line p-2">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <ChatBox compact />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
