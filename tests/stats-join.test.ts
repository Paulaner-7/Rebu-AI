import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stessoGiocatore, spareggioIniziale, statsGiocatore } from "../src/lib/stats";

describe("match tollerante nomi", () => {
  it("cognome secco e abbreviato agganciano, omonimi no", async () => {
    expect(stessoGiocatore("kevin de bruyne", "de bruyne")).toBe(true);
    expect(stessoGiocatore("domenico berardi", "berardi")).toBe(true);
    expect(stessoGiocatore("lautaro martinez", "martinez l")).toBe(true);
    expect(stessoGiocatore("lautaro martinez", "martinez jo")).toBe(false);
    expect(stessoGiocatore("kevin de bruyne", "bernardo silva")).toBe(false);
  });

  it("spareggio iniziale: Rossi M. vs Rossi F.", async () => {
    expect(spareggioIniziale("marco rossi", ["rossi m", "rossi f"])).toEqual(["rossi m"]);
  });

  it("statsGiocatore recupera riga understat non joinata stessa squadra", async () => {
    const db = await memDb();
    await db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
    await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
    await db.prepare(
      "INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic) VALUES ('t',2517,'De Bruyne','de bruyne','Napoli','C')"
    ).run();
    await db.prepare(
      `INSERT INTO player_stats (stagione, fonte, official_id, nome, nome_norm, squadra, ruolo, presenze, xg, xa)
       VALUES ('2026-27','understat',NULL,'Kevin De Bruyne','kevin de bruyne','napoli','M',2,0.46,0.31)`
    ).run();
    const s = await statsGiocatore(db, "t", 2517) as unknown as {
      stagioni: { stagione: string; xg: number | null; xa: number | null }[];
    };
    expect(s.stagioni).toHaveLength(1);
    expect(s.stagioni[0]?.xg).toBeCloseTo(0.46);
    expect(s.stagioni[0]?.xa).toBeCloseTo(0.31);
  });

  it("doppio omonimo stessa iniziale: nessun merge forzato", async () => {
    const db = await memDb();
    await db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
    await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
    await db.prepare(
      "INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic) VALUES ('t',9,'Rossi M.','rossi m','Roma','A')"
    ).run();
    const ins = await db.prepare(
      `INSERT INTO player_stats (stagione, fonte, official_id, nome, nome_norm, squadra, ruolo, presenze, xg)
       VALUES ('2026-27','understat',NULL,?,?, 'roma','F',2,?)`
    );
    await ins.run("Mario Rossi", "mario rossi", 0.5);
    await ins.run("Marco Rossi", "marco rossi", 0.7);
    const s = await statsGiocatore(db, "t", 9) as unknown as { stagioni: unknown[] };
    expect(s.stagioni).toHaveLength(0);
  });

  it("ambiguità stessa squadra: nessun merge forzato", async () => {
    const db = await memDb();
    await db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
    await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
    const ins = await db.prepare(
      "INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic) VALUES ('t',?,?,?,?,'A')"
    );
    await ins.run(1, "Rossi M.", "rossi m", "Roma");
    await ins.run(2, "Rossi F.", "rossi f", "Roma");
    await db.prepare(
      `INSERT INTO player_stats (stagione, fonte, official_id, nome, nome_norm, squadra, ruolo, presenze, xg)
       VALUES ('2026-27','understat',NULL,'Mario Rossi','mario rossi','roma','F',2,0.5)`
    ).run();
    await db.prepare(
      `INSERT INTO player_stats (stagione, fonte, official_id, nome, nome_norm, squadra, ruolo, presenze, xg)
       VALUES ('2026-27','understat',NULL,'Franco Rossi','franco rossi','roma','F',2,0.9)`
    ).run();
    // 2 righe omonime: l'iniziale smista Mario->"rossi m" e Franco->"rossi f".
    const s1 = await statsGiocatore(db, "t", 1) as unknown as { stagioni: { xg: number | null }[] };
    expect(s1.stagioni[0]?.xg).toBeCloseTo(0.5);
    const s2 = await statsGiocatore(db, "t", 2) as unknown as { stagioni: { xg: number | null }[] };
    expect(s2.stagioni[0]?.xg).toBeCloseTo(0.9);
  });
});
