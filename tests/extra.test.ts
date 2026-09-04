import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell, dumpBackup, restoreBackup, setPreferenza, control, getState } from "../src/lib/auction";
import { prossimeChiamate } from "../src/lib/pricing";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const OTTO = Array.from({ length: 8 }, (_, i) => ({ nome: `M${i+1}`, nome_squadra: "", note: "", is_owner: i === 0 }));

async function dbF() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  for (const [k, v] of [["dataset_attivo","t"]]) await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(k, v);
  const ins = await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm) VALUES ('t',?,?,?,?,?,?,?,?)`);
  for (let i = 1; i <= 30; i++) await ins.run(i, `Att${i}`, `att${i}`, "Roma", "A", "Pc", 40 - i, 400 - i * 5);
  return db;
}

describe("preferenze", () => {
  it("X escluso dal ranking, W spinto primo", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await setPreferenza(db, "t", 1, "X");
    await setPreferenza(db, "t", 15, "W"); // Att15, qt media: bonus pupillo lo porta primo
    const r = await prossimeChiamate(db, sid, 1, 30);
    expect(r.top.some((x) => x.official_id === 1)).toBe(false);
    expect(r.top[0].official_id).toBe(15);
    expect(r.top[0].motivi).toContain("pupillo");
  });
});

describe("backup roundtrip", () => {
  it("dump -> reset -> restore: rose identiche, stato PAUSA", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1); await sell(db, sid, { officialId: 1, managerId: 1, prezzo: 50, idem: "b1" });
    await nominate(db, sid, 2); await sell(db, sid, { officialId: 2, managerId: 3, prezzo: 20, idem: "b2" });
    const dump = await dumpBackup(db, sid);
    await control(db, sid, "complete");
    const sid2 = await restoreBackup(db, dump as unknown as Record<string, unknown>);
    const st = await getState(db, sid2);
    expect(st.session.stato).toBe("PAUSA");
    expect(st.acquisti).toBe(2);
    expect(st.managers[0].residui).toBe(450);
    expect(st.managers[2].residui).toBe(480);
  });
});
