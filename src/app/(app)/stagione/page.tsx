import { Sprout } from "lucide-react";
import { EmptyState, Eyebrow } from "@/components/ui";

export default function Page() {
  return (
    <main className="flex flex-col gap-4">
      <header>
        <Eyebrow>Work in progress</Eyebrow>
        <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Stagione</h1>
      </header>
      <EmptyState
        icon={Sprout}
        title="Assistente di stagione"
        body="Comparatore giocatori e consigli formazione arriveranno qui."
      />
    </main>
  );
}
