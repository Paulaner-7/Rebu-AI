export default function Loading() {
  return (
    <main className="flex animate-pulse flex-col gap-4" aria-label="Caricamento">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 rounded bg-panel2" />
        <div className="h-9 w-48 rounded bg-panel2" />
      </div>
      <div className="h-12 rounded-lg border border-line bg-panel" />
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-line/50 py-2 last:border-0">
            <div className="h-4 w-1/2 rounded bg-panel2" />
            <div className="h-4 w-10 rounded bg-panel2" />
          </div>
        ))}
      </div>
    </main>
  );
}
