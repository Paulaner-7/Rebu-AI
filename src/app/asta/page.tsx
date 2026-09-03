function Stub({ title, text }: { title: string; text: string }) {
  return (
    <main className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm opacity-70">{text}</p>
    </main>
  );
}
export default function Page() {
  return <Stub title="Asta" text="Fase 2: setup nomi + avvio. Ora placeholder." />;
}
