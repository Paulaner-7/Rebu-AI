import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  setupLeague, startAuction, nominate, bid, sell,
  dumpBackup, restoreBackup, getState, setPreferenza, control,
} from "../src/lib/auction";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");

async function freshDb() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('test-v1','h')").run();
  const set = await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo","test-v1"]]) await set.run(k, v);
  const ins = await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm)
    VALUES ('test-v1',?,?,?,?,?,?,?,?)`);
  for (let i = 1; i <= 30; i++) await ins.run(i, `G${i}`, `g${i}`, `Sq${i % 8}`, "A", "Pc", 10, 60);
  return db;
}

const OTTO = Array.from({ length: 8 }, (_, i) => ({
  nome: `M${i + 1}`, nome_squadra: "", note: "", is_owner: i === 0,
}));

describe("backup fine asta", () => {
  it("dump → disastro → restore: rose, preferenze e settings tornano", async () => {
    const db = await freshDb();
    const sid = await setupLeague(db, OTTO);
    await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    await bid(db, sid, { officialId: 1, prezzo: 20 });
    await sell(db, sid, { officialId: 1, managerId: 2, prezzo: 20, idem: "b1" });
    await setPreferenza(db, "test-v1", 5, "W");

    const dump = await dumpBackup(db, sid);
    expect(dump.backup).toBe(2);
    expect(dump.preferenze).toHaveLength(1);

    // disastro: tutto cancellato
    await db.exec("DELETE FROM purchases; DELETE FROM auction_events; DELETE FROM auction_sessions; DELETE FROM preferenze;");
    await db.prepare("UPDATE settings SET value='off' WHERE key='modificatore_default'").run();

    const sid2 = await restoreBackup(db, JSON.parse(JSON.stringify(dump)));
    const st = await getState(db, sid2);
    expect(st.managers[1].residui).toBe(480);
    expect(st.managers[1].rosa).toHaveLength(1);
    expect(await db.prepare("SELECT tipo FROM preferenze WHERE official_id=5").get()).toMatchObject({ tipo: "W" });
    expect((await db.prepare("SELECT value FROM settings WHERE key='modificatore_default'").get() as { value: string }).value).toBe("on");
    expect(st.session.stato).toBe("PAUSA");
  });

  it("restore rifiuta file sporco e dataset assente", async () => {
    const db = await freshDb();
    await expect(restoreBackup(db, { app: "X" })).rejects.toThrow();
    const db2 = await freshDb();
    const sid = await setupLeague(db2, OTTO);
    await startAuction(db2, sid, 0);
    const dump = await dumpBackup(db2, sid) as Record<string, unknown>;
    dump.dataset = "inesistente";
    await control(db2, sid, "complete"); // chiusa: sblocca restore, resta check dataset
    await expect(restoreBackup(db2, dump)).rejects.toThrow(/Dataset/);
  });
});
