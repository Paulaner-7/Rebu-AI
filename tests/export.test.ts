import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import {
  validateLegheExport, generateLegheFantacalcioCsv, buildLegheExportFilename,
  type ExportInput,
} from "../src/lib/export";

function base(): ExportInput {
  const teams = Array.from({ length: 8 }, (_, t) => {
    const players: { officialPlayerId: number; playerName: string; role: "P" | "D" | "C" | "A"; purchasePrice: number; status: "purchased" }[] = [];
    let id = t * 100 + 1;
    const mk = (role: "P" | "D" | "C" | "A", n: number) => {
      for (let i = 0; i < n; i++) { players.push({ officialPlayerId: id, playerName: `G${id}`, role, purchasePrice: 1, status: "purchased" as const }); id++; }
    };
    mk("P", 3); mk("D", 8); mk("C", 8); mk("A", 6);
    return { teamId: `team-${t + 1}`, displayOrder: t + 1, name: `Squadra ${t + 1}`, players };
  });
  return {
    schemaVersion: "1.0.0",
    league: { name: "Rebu Test", initialCredits: 500, datasetVersion: "t", rosterRules: { P: 3, D: 8, C: 8, A: 6 } },
    teams,
  };
}
const IDS = new Set(Array.from({ length: 800 }, (_, i) => i + 1));

describe("export Leghe", () => {
  it("golden file byte-exatti + deterministico", () => {
    const csv = generateLegheFantacalcioCsv(base(), IDS);
    writeFileSync("/tmp/rebu-sample.csv", csv);
    expect(csv.startsWith("$,$,$\nSquadra 1,1,1\n")).toBe(true);
    expect(csv.endsWith("\n") && !csv.endsWith("\n\n")).toBe(true);
    expect(csv).not.toMatch(" transmit");
    expect(csv.includes("officialPlayerId") || csv.includes("purchasePrice")).toBe(false); // niente header
    expect(generateLegheFantacalcioCsv(base(), IDS)).toBe(csv);
    expect(csv.split("\n").filter((l) => l === "$,$,$").length).toBe(8);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff); // niente BOM
  });
  it("rifiuta: 7 squadre, doppio id, nome con virgola, rosa errata, overspend, id ignoto", () => {
    const b7 = base(); b7.teams.pop();
    expect(validateLegheExport(b7, IDS).some((e) => e.code === "SQUADRE")).toBe(true);
    const dup = base(); dup.teams[1].players[0].officialPlayerId = 1;
    expect(validateLegheExport(dup, IDS).some((e) => e.code === "DOPPIO")).toBe(true);
    const comma = base(); comma.teams[0].name = "A,B";
    expect(validateLegheExport(comma, IDS).some((e) => e.code === "NOME")).toBe(true);
    const short = base(); short.teams[0].players.pop();
    expect(validateLegheExport(short, IDS).some((e) => e.code === "ROSA25")).toBe(true);
    const rich = base(); rich.teams[0].players.forEach((p) => (p.purchasePrice = 100));
    expect(validateLegheExport(rich, IDS).some((e) => e.code === "BUDGET")).toBe(true);
    const unk = base(); unk.teams[0].players[0].officialPlayerId = 99999;
    expect(validateLegheExport(unk, IDS).some((e) => e.code === "ID_IGNOTO")).toBe(true);
  });
  it("filename pattern", () => {
    expect(buildLegheExportFilename("Rebu AI", new Date("2026-09-03"))).toBe("rebu-ai-leghe-rebu-ai-2026-09-03.csv");
  });
});
