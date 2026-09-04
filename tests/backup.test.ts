import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  setupLeague, startAuction, nominate, bid, sell,
  dumpBackup, restoreBackup, getState, setPreferenza, control,
} from "../src/lib/auction";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('test-v1','h')").run();
  const set = db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo","test-v1"]]) set.run(k, v);
  const ins = db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm)
    VALUES ('test-v1',?,?,?,?,?,?,?,?)`);
  for (let i = 1; i <= 30; i++) ins.run(i, `G${i}`, `g${i}`, `Sq${i % 8}`, "A", "Pc", 10, 60);
  return db;
}

const OTTO = Array.from({ length: 8 }, (_, i) => ({
  nome: `M${i + 1}`, nome_squadra: "", note: "", is_owner: i === 0,
}));

describe("backup fine asta", () => {
  it("dump → disastro → restore: rose, preferenze e settings tornano", () => {
    const db = freshDb();
    const sid = setupLeague(db, OTTO);
    startAuction(db, sid, 0);
    nominate(db, sid, 1);
    bid(db, sid, { officialId: 1, prezzo: 20 });
    sell(db, sid, { officialId: 1, managerId: 2, prezzo: 20, idem: "b1" });
    setPreferenza(db, "test-v1", 5, "W");

    const dump = dumpBackup(db, sid);
    expect(dump.backup).toBe(2);
    expect(dump.preferenze).toHaveLength(1);

    // disastro: tutto cancellato
    db.exec("DELETE FROM purchases; DELETE FROM auction_events; DELETE FROM auction_sessions; DELETE FROM preferenze;");
    db.prepare("UPDATE settings SET value='off' WHERE key='modificatore_default'").run();

    const sid2 = restoreBackup(db, JSON.parse(JSON.stringify(dump)));
    const st = getState(db, sid2);
    expect(st.managers[1].residui).toBe(480);
    expect(st.managers[1].rosa).toHaveLength(1);
    expect(db.prepare("SELECT tipo FROM preferenze WHERE official_id=5").get()).toMatchObject({ tipo: "W" });
    expect((db.prepare("SELECT value FROM settings WHERE key='modificatore_default'").get() as { value: string }).value).toBe("on");
    expect(st.session.stato).toBe("PAUSA");
  });

  it("restore rifiuta file sporco e dataset assente", () => {
    const db = freshDb();
    expect(() => restoreBackup(db, { app: "X" })).toThrow();
    const db2 = freshDb();
    const sid = setupLeague(db2, OTTO);
    startAuction(db2, sid, 0);
    const dump = dumpBackup(db2, sid) as Record<string, unknown>;
    dump.dataset = "inesistente";
    control(db2, sid, "complete"); // chiusa: sblocca restore, resta check dataset
    expect(() => restoreBackup(db2, dump)).toThrow(/Dataset/);
  });
});
