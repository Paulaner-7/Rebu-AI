import Link from "next/link";
import { ArrowLeft, Crosshair, MessagesSquare, Target } from "lucide-react";
import { Eyebrow, Panel, PanelHead, RoleBadge, XIChip, Stat, btnGhost, cx } from "@/components/ui";
import { getPlayerDetail } from "@/lib/store";
import { getPlayerDetailSb, useSupabase } from "@/lib/store-sb";
import { fmt, deltaTone, DELTA_LABEL } from "@/lib/player-ui";

type Season = Record<string, unknown>;

const num = (s: Season | undefined, k: string): number | null =>
  s && typeof s[k] === "number" ? (s[k] as number) : null;
const str = (s: Season | undefined, k: string): string =>
  s && typeof s[k] === "string" ? (s[k] as string) : "";

const ROLE_BAR: Record<string, string> = { P: "bg-p", D: "bg-d", C: "bg-c", A: "bg-a" };
const ROLE_HEX: Record<string, string> = { P: "#f2c94c", D: "#3ecf8e", C: "#5b9dff", A: "#ff6b6b" };
const DELTA_PILL: Record<string, string> = {
  sovra: "border-signal/50 bg-signal/10 text-signal",
  sotto: "border-d/40 bg-d/10 text-d",
  linea: "border-line bg-panel2 text-muted",
  vuoto: "border-line bg-panel2 text-faint",
};

function Bar({ value, max, cls }: { value: number | null; max: number; cls: string }) {
  const pct = value === null || max <= 0 ? 0 : Math.min(100, (value / max) * 100);
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-panel2" aria-hidden>
      <span className={cx("block h-full rounded-full transition-all", cls)} style={{ width: `${pct}%` }} />
    </span>
  );
}

function DeltaPill({ scarto }: { scarto: number | null }) {
  const t = deltaTone(scarto);
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold", DELTA_PILL[t])}>
      {scarto === null ? DELTA_LABEL.vuoto : `${scarto > 0 ? "+" : ""}${fmt(scarto, 1)} · ${DELTA_LABEL[t]}`}
    </span>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const useSb = useSupabase();
  const detail = useSb ? await getPlayerDetailSb(Number(id)) : await getPlayerDetail(Number(id));

  if (!detail) {
    return (
      <main className="flex flex-col gap-4">
        <Link href="/giocatori" className={cx(btnGhost, "self-start")}>
          <ArrowLeft className="size-4" aria-hidden /> Giocatori
        </Link>
        <Panel>
          <Eyebrow>Scheda giocatore</Eyebrow>
          <h1 className="font-display mt-2 text-2xl font-extrabold uppercase">Non trovato</h1>
          <p className="mt-2 text-sm text-muted">
            ID fuori dataset attivo o dataset non importato. Torna al listone e tocca un nome.
          </p>
        </Panel>
      </main>
    );
  }

  const { player: p, dataset, stats } = detail;
  const stagioni = (stats.stagioni.filter(Boolean) as Season[]).sort((a, b) =>
    String(a.stagione ?? "").localeCompare(String(b.stagione ?? ""))
  );
  const live = stagioni.find((s) => s.stagione === "2026-27") ?? stagioni[stagioni.length - 1];
  const liveLabel = str(live, "stagione") || "2026-27";
  const sintesi = stats.sintesi as unknown as Record<string, number | string | null>;
  const maxGol = Math.max(1, ...stagioni.map((s) => Math.max(num(s, "gol") ?? 0, num(s, "xg") ?? 0)));
  const maxFm = Math.max(1, ...stagioni.map((s) => num(s, "fantamedia") ?? 0));
  const barCls = ROLE_BAR[p.ruolo_classic] ?? "bg-signal";

  return (
    <main className="flex flex-col gap-4">
      <Link href="/giocatori" className={cx(btnGhost, "self-start !min-h-[40px] px-3 text-sm")}>
        <ArrowLeft className="size-4" aria-hidden /> Giocatori
      </Link>

      {/* ——— hero stile FotMob: fascia ruolo + rating FM ——— */}
      <section
        className="overflow-hidden rounded-xl border border-line bg-panel"
        style={{ borderTop: `2px solid ${ROLE_HEX[p.ruolo_classic] ?? "#ffb224"}` }}
      >
        <div className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <Eyebrow>Scheda · {p.squadra} · Dataset {dataset}</Eyebrow>
            <h1 className="font-display mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight">{p.nome}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RoleBadge r={p.ruolo_classic} />
              {p.is_titolare ? <XIChip /> : null}
              <span className="font-mono text-[11px] text-faint">{p.ruolo_mantra}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              <Stat label="Quotazione" value={p.qt_a ?? "—"} />
              <Stat label="FVM" value={p.fvm ?? "—"} />
              <Stat label="FM live" value={fmt(num(live, "fantamedia"), 2)} tone="text-signal" />
              <Stat label="MV live" value={fmt(num(live, "media_voto"), 2)} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1" title="Fantamedia stagione in corso">
            <span className="tnum flex size-20 items-center justify-center rounded-full border-2 border-signal/70 bg-panel2 font-mono text-2xl font-bold text-signal">
              {fmt(num(live, "fantamedia"), 1)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">FM {liveLabel.slice(2)}</span>
          </div>
        </div>
      </section>

      {/* ——— sintesi multi-anno stile Understat ——— */}
      <Panel>
        <PanelHead icon={Target} title="Segnale rendimento" hint={`${stagioni.length} stagioni · KB-STA-01`} />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Stat label="Gol totali" value={fmt(sintesi.gol_totali as number)} />
          <Stat label="xG totali" value={fmt(sintesi.xg_totali as number, 1)} />
          <Stat label="Assist" value={fmt(sintesi.assist_totali as number)} />
          <Stat label="xA totali" value={fmt(sintesi.xa_totali as number, 1)} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DeltaPill scarto={sintesi.scarto_gol_meno_xg as number | null} />
          <span className="font-mono text-[11px] text-faint">
            FM media {fmt(sintesi.fantamedia_media as number, 2)} · scarto calcolato su anni coperti
          </span>
        </div>
      </Panel>

      {/* ——— stagione in corso: due fonti ——— */}
      <Panel>
        <PanelHead icon={Crosshair} title={`Stagione ${liveLabel}`} hint={live ? `fonti: ${(live.fonti as string[] ?? []).join(" + ") || "—"}` : "dati assenti"} />
        {live ? (
          <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Stat label="Presenze" value={fmt(num(live, "presenze"))} />
            <Stat label="Minuti" value={fmt(num(live, "minuti"))} />
            <Stat label="Gol" value={fmt(num(live, "gol"))} />
            <Stat label="xG" value={fmt(num(live, "xg"), 2)} />
            <Stat label="Assist" value={fmt(num(live, "assist"))} />
            <Stat label="xA" value={fmt(num(live, "xa"), 2)} />
            <Stat label="Tiri" value={fmt(num(live, "tiri"))} />
            <Stat label="Pass. chiave" value={fmt(num(live, "passaggi_chiave"))} />
            <Stat label="MV" value={fmt(num(live, "media_voto"), 2)} />
            <Stat label="FM" value={fmt(num(live, "fantamedia"), 2)} tone="text-signal" />
            <Stat label="Amm / Esp" value={`${fmt(num(live, "ammonizioni"))} / ${fmt(num(live, "espulsioni"))}`} />
            <Stat label="Rig. segn/sbag" value={`${fmt(num(live, "rigori_segnati"))} / ${fmt(num(live, "rigori_sbagliati"))}`} />
          </div>
        ) : (
          <p className="text-sm text-muted">Nessun dato 26/27: giocatore nuovo in Serie A o sync non ancora scattato.</p>
        )}
        <p className="mt-3 font-mono text-[11px] text-faint">fantacalcio.it = voti e bonus ufficiali · Understat = metriche avanzate</p>
      </Panel>

      {/* ——— andamento FotMob: gol vs xG + FM ——— */}
      <Panel>
        <PanelHead title="Andamento per stagione" hint="gol vs xG · FM" />
        <div className="flex flex-col gap-3">
          {stagioni.map((s) => {
            const g = num(s, "gol"), x = num(s, "xg"), f = num(s, "fantamedia");
            const sc = g !== null && x !== null ? Math.round((g - x) * 10) / 10 : null;
            return (
              <div key={String(s.stagione)} className="rounded-lg border border-line/60 bg-panel2/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <b className="tnum font-mono text-sm">{String(s.stagione)}</b>
                  <DeltaPill scarto={sc} />
                </div>
                <div className="grid gap-2">
                  <div>
                    <div className="mb-1 flex justify-between font-mono text-[11px] text-muted">
                      <span>Gol {fmt(g)}</span><span>xG {fmt(x, 2)}</span>
                    </div>
                    <Bar value={g} max={maxGol} cls={barCls} />
                    <div className="mt-1"><Bar value={x} max={maxGol} cls="bg-signal/70" /></div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between font-mono text-[11px] text-muted">
                      <span>FM</span><span className="tnum">{fmt(f, 2)}</span>
                    </div>
                    <Bar value={f} max={maxFm} cls="bg-ink" />
                  </div>
                </div>
              </div>
            );
          })}
          {!stagioni.length && <p className="text-sm text-muted">Storico assente: mai apparso nelle fonti 22/23 → 26/27.</p>}
        </div>
      </Panel>

      {/* ——— storico tabellare completo ——— */}
      {!!stagioni.length && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["Stag.", "Pr", "Gol", "xG", "Ass", "xA", "MV", "FM", "Tiri", "KP"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stagioni.map((s) => (
                <tr key={String(s.stagione)} className="border-b border-line/60 font-mono last:border-0 hover:bg-panel2/60">
                  <td className="tnum px-3 py-2 font-semibold">{String(s.stagione)}</td>
                  <td className="tnum px-3 py-2 text-right">{fmt(num(s, "presenze"))}</td>
                  <td className="tnum px-3 py-2 text-right">{fmt(num(s, "gol"))}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">{fmt(num(s, "xg"), 2)}</td>
                  <td className="tnum px-3 py-2 text-right">{fmt(num(s, "assist"))}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">{fmt(num(s, "xa"), 2)}</td>
                  <td className="tnum px-3 py-2 text-right">{fmt(num(s, "media_voto"), 2)}</td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-signal">{fmt(num(s, "fantamedia"), 2)}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">{fmt(num(s, "tiri"))}</td>
                  <td className="tnum px-3 py-2 text-right text-muted">{fmt(num(s, "passaggi_chiave"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-mono text-[11px] leading-relaxed text-faint">{String(stats.formula ?? "")}</p>
      <Link href="/chat" className={cx(btnGhost, "self-start")}>
        <MessagesSquare className="size-4" aria-hidden /> Chiedi a Rebu su {p.nome}
      </Link>
    </main>
  );
}
