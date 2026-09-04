"use client";
import { useState } from "react";
import { Cpu, X } from "lucide-react";
import ChatBox from "../chat/chatbox";

export default function AiDock() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden lg:flex lg:sticky lg:top-4 max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-panel" aria-label="Finestra AI">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Cpu className="size-4 text-signal" aria-hidden />
          <p className="font-display text-sm font-bold uppercase tracking-wide">Rebu AI</p>
          <span className="ml-auto font-mono text-[10px] text-faint">vede asta live</span>
        </div>
        <div className="overflow-y-auto p-3">
          <ChatBox compact />
        </div>
      </aside>
      <div className="lg:hidden">
        {!open && (
          <button
            onClick={() => setOpen(true)}
            aria-label="Apri finestra AI"
            className="fixed bottom-4 right-4 z-40 flex min-h-[56px] items-center gap-2 rounded-full bg-signal px-5 font-semibold text-bg shadow-lg transition active:scale-95"
          >
            <Cpu className="size-5" aria-hidden />
            Chiedi a Rebu
          </button>
        )}
        {open && (
          <div className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col rounded-t-2xl border border-line bg-panel shadow-2xl" role="dialog" aria-label="Finestra AI">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Cpu className="size-4 text-signal" aria-hidden />
              <p className="font-display text-sm font-bold uppercase tracking-wide">Rebu AI</p>
              <button onClick={() => setOpen(false)} aria-label="Chiudi finestra AI" className="ml-auto rounded-lg border border-line p-2">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ChatBox compact />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
