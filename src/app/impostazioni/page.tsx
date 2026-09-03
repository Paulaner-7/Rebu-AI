import { publicState } from "@/lib/auction-store";
import SettingsForm from "./settings-form";

export default function Page() {
  const { state } = publicState();
  const stato = state?.session.stato ?? "";
  const editable = stato === "" || stato === "PRONTA";
  const astaAperta = stato === "LIVE" || stato === "PAUSA";
  return (
    <main className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Impostazioni</h1>
      <SettingsForm editable={editable} astaAperta={astaAperta} />
    </main>
  );
}
