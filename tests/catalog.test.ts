import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell } from "../src/lib/auction";
import { searchAvailable } from "../src/lib/catalog";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const OTTO = Array.from({ length: 8 }, (_, i) => ({
  nome: `M${i + 1}`, nome_squadra: "", note: "", is_owner: i === 0,
}));

function dbConDati() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  for (const [k, v] of [["dataset_attivo","t"]]) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(k, v);
  const ins = db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, is_titolare)
    VALUES ('t',?,?,?,?,?,?,?, ?,0)`);
  ins.run(1, "Martinez L.", "martinez l", "Inter", "A", "Pc", 33, 361);
  ins.run(2, "Martinez Jo.", "martinez jo", "Inter", "P", "Por", 17, 68);
  ins.run(3, "Malen", "malen", "Roma", "A", "Pc", 38, 450);
  return db;
}

describe("ricerca live", () => {
  it("min 3 caratteri, omonimi distinti Nome+Squadra+Ruolo", () => {
    const db = dbConDati();
    const sid = setupLeague(db, OTTO);
    startAuction(db, sid, 0);
    expect(searchAvailable(db, sid, "t", "ma", "", "")).toEqual([]);
    const r = searchAvailable(db, sid, "t", "martinez", "", "");
    expect(r.length).toBe(2);
    expect(new Set(r.map((x) => `${x.nome}|${x.squadra}|${x.ruolo}`)).size).toBe(2);
  });
  it("venduti esclusi, filtri ruolo/squadra", () => {
    const db = dbConDati();
    const sid = setupLeague(db, OTTO);
    startAuction(db, sid, 0);
    nominate(db, sid, 3);
    sell(db, sid, { officialId: 3, managerId: 1, prezzo: 10, idem: "k" });
    expect(searchAvailable(db, sid, "t", "malen", "", "").length).toBe(0);
    expect(searchAvailable(db, sid, "t", "martinez", "P", "").map((x) => x.nome)).toEqual(["Martinez Jo."]);
    expect(searchAvailable(db, sid, "t", "martinez", "", "Roma").length).toBe(0);
  });
});
