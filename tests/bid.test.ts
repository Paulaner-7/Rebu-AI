import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  setupLeague, startAuction, nominate, bid, sell, markUnsold, undoLast,
  getState, turnoChiamata, AuctionError,
} from "../src/lib/auction";
import { verdettoRialzo, prezzoPrevisto } from "../src/lib/pricing";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('test-v1','h')").run();
  const set = db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo","test-v1"]]) set.run(k, v);
  const ins = db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, is_titolare)
    VALUES ('test-v1',?,?,?,?,?,?,?, ?,?)`);
  for (let i = 1; i <= 40; i++) ins.run(i, `GA${i}`, `ga${i}`, `Sq${i % 8}`, "A", "Pc", 10 + i, 50 + i * 2, i % 2);
  return db;
}

const OTTO = Array.from({ length: 8 }, (_, i) => ({
  nome: `M${i + 1}`, nome_squadra: "", note: "", is_owner: i === 0,
}));

function liveDb() {
  const db = freshDb();
  const sid = setupLeague(db, OTTO);
  startAuction(db, sid, 0);
  return { db, sid };
}

async function errOf(fn: () => unknown): Promise<AuctionError> {
  try { await fn(); } catch (e) { return e as AuctionError; }
  throw new Error("nessun errore sollevato");
}

describe("rialzi come asta vera", () => {
  it("nomina a giro, rialzi, STOP a ultima chiamata", async () => {
    const { db, sid } = liveDb();
    // giro parte da M1
    expect(turnoChiamata(db, sid).nome).toBe("M1");
    const n = nominate(db, sid, 1);
    expect(n.chiamatoDa.nome).toBe("M1");
    // giro avanza anche prima di vendere
    expect(turnoChiamata(db, sid).nome).toBe("M2");
    // rialzi
    expect(bid(db, sid, { officialId: 1, prezzo: 5 }).prezzo).toBe(5);
    expect((await errOf(() => bid(db, sid, { officialId: 1, prezzo: 3 }))).code).toBe("RIALZO");
    expect(bid(db, sid, { officialId: 1, prezzo: 5 }).duplicato).toBe(true); // doppio tap ok
    bid(db, sid, { officialId: 1, prezzo: 8 });
    expect(getState(db, sid).ultimaChiamata).toEqual({ prezzo: 8 });
    // STOP con prezzo diverso da ultima chiamata: vietato
    expect((await errOf(() => sell(db, sid, { officialId: 1, managerId: 2, prezzo: 5, idem: "x1" }))).code).toBe("PREZZO");
    sell(db, sid, { officialId: 1, managerId: 2, prezzo: 8, idem: "x1" });
    const st = getState(db, sid);
    expect(st.ultimaChiamata).toBeNull();
    expect(st.managers[1].residui).toBe(492);
  });

  it("rinomina riparte da zero, undo BID non rompe", () => {
    const { db, sid } = liveDb();
    nominate(db, sid, 2);
    bid(db, sid, { officialId: 2, prezzo: 10 });
    markUnsold(db, sid, 2);
    nominate(db, sid, 2);
    expect(getState(db, sid).ultimaChiamata).toBeNull();
    bid(db, sid, { officialId: 2, prezzo: 4 });
    const u = undoLast(db, sid); // annulla BID
    expect(u.annullato).toBe("BID");
    expect(getState(db, sid).ultimaChiamata).toBeNull();
  });

  it("verdetto: ALZA sotto valore, TENTENNA in mezzo, MOLLA oltre tetto", () => {
    const { db, sid } = liveDb();
    nominate(db, sid, 3);
    const v1 = verdettoRialzo(db, sid, 1, 3, 1);
    expect(v1.verdetto).toBe("ALZA");
    const vt = verdettoRialzo(db, sid, 1, 3, 33); // consigliato 28 + range 10
    expect(vt.verdetto).toBe("TENTENNA");
    const vo = verdettoRialzo(db, sid, 1, 3, 39); // oltre 28+10 → STOP
    expect(vo.verdetto).toBe("MOLLA");
    const v2 = verdettoRialzo(db, sid, 1, 3, 499);
    expect(v2.verdetto).toBe("MOLLA");
    expect(v2.numeri.tetto).toBeLessThan(499);
  });

  it("previsto: base mercato × momentum, non quotazione", () => {
    const { db } = liveDb();
    // FVM 450/2 = 225, senza storiche: neutro (caso Malen)
    const ins = db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm)
      VALUES ('test-v1',?,?,?,?,?,?,?,?)`);
    ins.run(100, "MalenX", "malenx", "Roma", "A", "Pc", 38, 450);
    expect(prezzoPrevisto(db, "test-v1", 100).valore).toBe(225);
    // momentum up 20→30: ratio 1.5 → k 1.25
    ins.run(101, "UpX", "upx", "Roma", "A", "Pc", 30, 200);
    db.prepare("UPDATE players SET qt_2526=30, qt_2425=20 WHERE official_id=101").run();
    expect(prezzoPrevisto(db, "test-v1", 101).valore).toBe(125);
    // momentum down 30→10: floor 0.7
    ins.run(102, "DownX", "downx", "Roma", "A", "Pc", 10, 200);
    db.prepare("UPDATE players SET qt_2526=10, qt_2425=30 WHERE official_id=102").run();
    expect(prezzoPrevisto(db, "test-v1", 102).valore).toBe(70);
  });
});
