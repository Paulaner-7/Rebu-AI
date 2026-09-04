import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateContract, extractContract, SYSTEM_PROMPT, TOOL_DEFS, execTool } from "../src/lib/agent";
import { kbBlocco, kbCerca, kbDigest } from "../src/lib/knowledge";
import { statsGiocatore, classificaStats } from "../src/lib/stats";

describe("contratto agente", () => {
  it("system prompt: vincoli presenti", () => {
    for (const s of ["Non inventi MAI numeri", "decisione finale è sua", "italiano"]) {
      expect(SYSTEM_PROMPT).toMatch(s);
    }
  });
  it("valida COMPRA ok, rifiuta >3 motivazioni e azioni ignote", () => {
    const ok = { azione: "RILANCIA_FINO_A", prezzoMassimoConsigliato: 200, confidenza: "ALTA", motivazioni: ["a", "b"], alternative: ["X"], fonti: ["tettoRilancio"] };
    expect(validateContract(ok)?.azione).toBe("RILANCIA_FINO_A");
    expect(validateContract({ ...ok, azione: "HOLD" })).toBeNull();
    expect(validateContract({ ...ok, motivazioni: ["a", "b", "c", "d"] })).toBeNull();
    expect(validateContract({ ...ok, prezzoMassimoConsigliato: 12.5 })).toBeNull();
  });
  it("estrae JSON da risposta con testo", () => {
    const t = 'Prendo Malen fino a 200, decisione tua.\n```json\n{"azione":"COMPRA","prezzoMassimoConsigliato":200,"confidenza":"MEDIA","motivazioni":["titolare"],"alternative":[],"fonti":["prezzoRiferimento"]}\n```';
    expect(extractContract(t)?.prezzoMassimoConsigliato).toBe(200);
    expect(extractContract("solo testo, niente json")).toBeNull();
  });
});

describe("tool statistici e KB", () => {
  it("tool statistiche e KB registrati", () => {
    const nomi = TOOL_DEFS.map((t) => t.function.name);
    for (const n of ["consultaStrategia", "statsGiocatore", "classificaStats"]) {
      expect(nomi).toContain(n);
    }
  });

  it("KB: ricerca per argomento e blocco esatto", () => {
    expect(kbBlocco("KB-RIL-01")?.testo).toContain("tetto");
    const r = kbCerca("esche far spendere avversari", 3);
    expect(r.risultati.length).toBeGreaterThan(0);
    expect(kbDigest(900).length).toBeLessThanOrEqual(900);
  });

  it("execTool instrada i tre nuovi tool senza crash", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
    db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
    db.prepare("INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic) VALUES ('t',1,'Prova X','prova x','Roma','A')").run();
    const kb = execTool(db, 0, "t", "consultaStrategia", { argomento: "KB-RIL-01" }) as { totale: number };
    expect(kb.totale).toBe(1);
    const st = statsGiocatore(db, "t", 1) as { sintesi: { stagioni_coperte: number; gol_totali: number }; stagioni: unknown[] };
    expect(st.stagioni).toEqual([]);
    expect(st.sintesi.stagioni_coperte).toBe(0);
    expect(st.sintesi.gol_totali).toBe(0);
    const cl = classificaStats(db, "xg", "", "", 5) as { top: unknown[] };
    expect(cl.top).toEqual([]);
    const bad = classificaStats(db, "drop table", "", "", 5) as { errore: string };
    expect(bad.errore).toMatch("non valida");
  });
});
