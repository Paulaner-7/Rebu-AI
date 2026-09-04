import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verificaNomi, filtraAlternativeValide } from "../src/lib/rosa-guard";
import { TOOL_DEFS, SYSTEM_PROMPT, execTool, contestoLive } from "../src/lib/agent";

async function dbTest() {
  const db = await memDb();
  await db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  const ins = await db.prepare(
    "INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic) VALUES ('t',?,?,?,?,'A')"
  );
  await ins.run(2764, "Martinez L.", "martinez l", "Inter");
  await ins.run(1, "Prova X", "prova x", "Roma");
  return db;
}

describe("guard rosa 26/27", () => {
  it("verificaNomi: esatto + case-insensitive, ignoti scartati", async () => {
    const db = await dbTest();
    const r = await verificaNomi(db, "t", ["Martinez L.", "GIGNO FUORI ROSA", "  "]);
    expect(r.trovati.map((t) => t.nome)).toContain("Martinez L.");
    expect(r.ignoti).toContain("GIGNO FUORI ROSA");
  });

  it("filtraAlternativeValide: tiene solo nomi dataset", async () => {
    const db = await dbTest();
    expect(await filtraAlternativeValide(db, "t", ["Prova X", "Fantasma Y"])).toEqual(["Prova X"]);
  });

  it("prompt: divieto nomi inventati + 26/27 prima, vecchi vincoli intatti", async () => {
    for (const s of ["MAI inventare nomi", "2026/27", "Non inventi MAI numeri", "decisione finale è sua", "italiano"]) {
      expect(SYSTEM_PROMPT).toMatch(s);
    }
    expect(TOOL_DEFS.map((t) => t.function.name)).toContain("verificaGiocatori");
  });

  it("execTool verificaGiocatori: live null senza stats, niente crash", async () => {
    const db = await dbTest();
    const out = await execTool(db, 0, "t", "verificaGiocatori", { nomi: ["Martinez L.", "Fantasma Y"] }) as {
      trovati: { nome: string; live_2627: null }[];
      ignoti: string[];
    };
    expect(out.trovati[0]?.nome).toBe("Martinez L.");
    expect(out.trovati[0]?.live_2627).toBeNull();
    expect(out.ignoti).toContain("Fantasma Y");
  });

  it("contestoLive: senza asta ritorna stringa vuota, mai throw", async () => {
    expect(await contestoLive(await dbTest(), 0, "t")).toBe("");
  });
});
