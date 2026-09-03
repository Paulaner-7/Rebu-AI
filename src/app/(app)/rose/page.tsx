import { Shirt } from "lucide-react";
import { EmptyState, Eyebrow } from "@/components/ui";

export default function Page() {
  return (
    <main className="flex flex-col gap-4">
      <header>
        <Eyebrow>Squadre</Eyebrow>
        <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Rose</h1>
      </header>
      <EmptyState
        icon={Shirt}
        title="Rose live in arrivo"
        body="Fase 3: rose e crediti live. Durante l'asta le rose aggiornate si consultano dalla console."
      />
    </main>
  );
}
