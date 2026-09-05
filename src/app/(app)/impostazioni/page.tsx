import { publicState, writableDb } from "@/lib/auction-store";
import { cachedDb } from "@/lib/pgdb";
import { Eyebrow } from "@/components/ui";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { state } = await publicState(cachedDb(writableDb()));
  const stato = state?.session.stato ?? "";
  const editable = stato === "" || stato === "PRONTA";
  const astaAperta = stato === "LIVE" || stato === "PAUSA";
  return (
    <main className="flex flex-col gap-3">
      <header>
        <Eyebrow>Lega</Eyebrow>
        <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Impostazioni</h1>
      </header>
      <SettingsForm editable={editable} astaAperta={astaAperta} />
    </main>
  );
}
