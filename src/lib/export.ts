import type { DatabaseSync } from "node:sqlite";

// Export Leghe Fantacalcio per template dati/template_export.json (500 crediti).
// Solo codice deterministico, mai LLM.

export type ExportPlayer = {
  officialPlayerId: number; playerName: string; role: "P" | "D" | "C" | "A";
  purchasePrice: number; status: "purchased";
};
export type ExportTeam = { teamId: string; displayOrder: number; name: string; players: ExportPlayer[] };
export type ExportInput = {
  schemaVersion: "1.0.0";
  league: { name: string; initialCredits: 500; datasetVersion: string; rosterRules: { P: 3; D: 8; C: 8; A: 6 } };
  teams: ExportTeam[];
};

export type VError = { code: string; message: string; path: string };

const ROLE_ORDER = ["P", "D", "C", "A"] as const;

export function validateLegheExport(input: ExportInput, knownIds: Set<number>): VError[] {
  const errs: VError[] = [];
  const E = (code: string, message: string, path: string) => errs.push({ code, message, path });
  if (input.schemaVersion !== "1.0.0") E("SCHEMA", "schemaVersion deve essere 1.0.0", "/schemaVersion");
  if (input.league.initialCredits !== 500) E("CREDITI", "initialCredits deve essere 500", "/league/initialCredits");
  const rr = input.league.rosterRules;
  if (!(rr.P === 3 && rr.D === 8 && rr.C === 8 && rr.A === 6)) E("ROSA", "rosa deve essere 3/8/8/6", "/league/rosterRules");
  if (input.teams.length !== 8) E("SQUADRE", "servono 8 squadre", "/teams");
  const orders = input.teams.map((t) => t.displayOrder).sort((a, b) => a - b);
  if (JSON.stringify(orders) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8])) E("ORDINE", "displayOrder 1..8 univoci", "/teams");
  const names = new Set<string>();
  const seenIds = new Set<number>();
  for (const t of input.teams) {
    if (names.has(t.name)) E("NOME_DUP", `nome duplicato ${t.name}`, `/teams/${t.displayOrder}`);
    names.add(t.name);
    if (/[,$\r\n]/.test(t.name)) E("NOME", `nome vietato (, $ a capo): ${t.name}`, `/teams/${t.displayOrder}`);
    if (t.players.length !== 25) E("ROSA25", `${t.name}: ${t.players.length} invece di 25`, `/teams/${t.displayOrder}`);
    const per: Record<string, number> = { P: 0, D: 0, C: 0, A: 0 };
    let speso = 0;
    for (const p of t.players) {
      if (p.status !== "purchased") continue;
      per[p.role] = (per[p.role] ?? 0) + 1;
      speso += p.purchasePrice;
      if (!Number.isInteger(p.purchasePrice) || p.purchasePrice < 1 || p.purchasePrice > 500) {
        E("PREZZO", `${t.name}/${p.playerName}: prezzo 1..500`, `/teams/${t.displayOrder}`);
      }
      if (seenIds.has(p.officialPlayerId)) E("DOPPIO", `id ${p.officialPlayerId} in due rose`, `/teams/${t.displayOrder}`);
      seenIds.add(p.officialPlayerId);
      if (!knownIds.has(p.officialPlayerId)) E("ID_IGNOTO", `id ${p.officialPlayerId} fuori dataset`, `/teams/${t.displayOrder}`);
    }
    if (!(per.P === 3 && per.D === 8 && per.C === 8 && per.A === 6)) {
      E("RUOLI", `${t.name}: P${per.P}/D${per.D}/C${per.C}/A${per.A} invece di 3/8/8/6`, `/teams/${t.displayOrder}`);
    }
    if (speso > 500) E("BUDGET", `${t.name}: speso ${speso} oltre 500`, `/teams/${t.displayOrder}`);
  }
  return errs;
}

export function generateLegheFantacalcioCsv(input: ExportInput, knownIds: Set<number>): string {
  const errs = validateLegheExport(input, knownIds);
  if (errs.length) throw Object.assign(new Error(`Export bloccato: ${errs[0].message}`), { errs });
  const lines: string[] = [];
  for (const t of [...input.teams].sort((a, b) => a.displayOrder - b.displayOrder)) {
    lines.push("$,$,$");
    const ps = t.players
      .filter((p) => p.status === "purchased")
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.playerName.localeCompare(b.playerName, "it"));
    for (const p of ps) lines.push(`${t.name},${p.officialPlayerId},${p.purchasePrice}`);
  }
  return lines.join("\n") + "\n";
}

export function buildLegheExportFilename(leagueName: string, date: Date): string {
  const slug = leagueName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "lega";
  return `rebu-ai-leghe-${slug}-${date.toISOString().slice(0, 10)}.csv`;
}

export function buildExportInput(db: DatabaseSync, sid: number, leagueName: string): ExportInput {
  const s = db.prepare("SELECT dataset_version AS d, stato FROM auction_sessions WHERE id=?").get(sid) as { d: string; stato: string };
  const mans = db.prepare("SELECT id, nome FROM managers ORDER BY id").all() as { id: number; nome: string }[];
  const teams: ExportTeam[] = mans.map((m, i) => {
    const rows = db.prepare(
      `SELECT pl.official_id AS o, pl.nome AS n, pl.ruolo_classic AS r, pu.prezzo AS p
       FROM purchases pu JOIN players pl ON pl.id=pu.player_id
       WHERE pu.session_id=? AND pu.manager_id=?`
    ).all(sid, m.id) as { o: number; n: string; r: string; p: number }[];
    return {
      teamId: `team-${m.id}`, displayOrder: i + 1, name: m.nome,
      players: rows.map((x) => ({ officialPlayerId: x.o, playerName: x.n, role: x.r as "P" | "D" | "C" | "A", purchasePrice: x.p, status: "purchased" as const })),
    };
  });
  return {
    schemaVersion: "1.0.0",
    league: { name: leagueName, initialCredits: 500, datasetVersion: s.d, rosterRules: { P: 3, D: 8, C: 8, A: 6 } },
    teams,
  };
}

export function knownIds(db: DatabaseSync, dataset: string): Set<number> {
  const rows = db.prepare("SELECT official_id AS o FROM players WHERE dataset_version=?").all(dataset) as { o: number }[];
  return new Set(rows.map((r) => r.o));
}
