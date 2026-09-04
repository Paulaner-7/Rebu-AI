import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  setupLeague, startAuction, nominate, bid, sell, markUnsold, undoLast,
  getState, turnoChiamata, AuctionError,
} from "../src/lib/auction";
import { verdettoRialzo, prezzoPrevisto } from "../src/lib/pricing";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");

async function freshDb() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('test-v1','h')").run();
  const set = await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo","test-v1"]]) await set.run(k, v);
  const ins = await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, is_titolare)
    VALUES ('test-v1',?,?,?,?,?,?,?, ?,?)`);
  for (let i = 1; i <= 40; i++) await ins.run(i, `GA${i}`, `ga${i}`, `Sq${i % 8}`, "A", "Pc", 10 + i, 50 + i * 2, i % 2);
  return db;
}

const OTTO = Array.from({ length: 8 }, (_, i) => ({
  nome: `M${i + 1}`, nome_squadra: "", note: "", is_owner: i === 0,
}));

async function liveDb() {
  const db = await freshDb();
  const sid = await setupLeague(db, OTTO);
  await startAuction(db, sid, 0);
  return { db, sid };
}

async function errOf(fn: () => unknown): Promise<AuctionError> {
  try { await fn(); } catch (e) { return e as AuctionError; }
  throw new Error("nessun errore sollevato");
}

describe("rialzi come asta vera", () => {
  it("nomina a giro, rialzi, STOP a ultima chiamata", async () => {
    const { db, sid } = await liveDb();
    // giro parte da M1
    expect(await (await turnoChiamata(db, sid)).nome).toBe("M1");
    const n = await nominate(db, sid, 1);
    expect(n.chiamatoDa.nome).toBe("M1");
    // giro avanza anche prima di vendere
    expect(await (await turnoChiamata(db, sid)).nome).toBe("M2");
    // rialzi
    expect(await (await bid(db, sid, { officialId: 1, prezzo: 5 })).prezzo).toBe(5);
    expect((await errOf(() => bid(db, sid, { officialId: 1, prezzo: 3 }))).code).toBe("RIALZO");
    expect(await (await bid(db, sid, { officialId: 1, prezzo: 5 })).duplicato).toBe(true); // doppio tap ok
    await bid(db, sid, { officialId: 1, prezzo: 8 });
    expect(await (await getState(db, sid)).ultimaChiamata).toEqual({ prezzo: 8 });
    // STOP con prezzo diverso da ultima chiamata: vietato
    expect((await errOf(() => sell(db, sid, { officialId: 1, managerId: 2, prezzo: 5, idem: "x1" }))).code).toBe("PREZZO");
    await sell(db, sid, { officialId: 1, managerId: 2, prezzo: 8, idem: "x1" });
    const st = await getState(db, sid);
    expect(st.ultimaChiamata).toBeNull();
    expect(st.managers[1].residui).toBe(492);
  });

  it("rinomina riparte da zero, undo BID non rompe", async () => {
    const { db, sid } = await liveDb();
    await nominate(db, sid, 2);
    await bid(db, sid, { officialId: 2, prezzo: 10 });
    await markUnsold(db, sid, 2);
    await nominate(db, sid, 2);
    expect(await (await getState(db, sid)).ultimaChiamata).toBeNull();
    await bid(db, sid, { officialId: 2, prezzo: 4 });
    const u = await undoLast(db, sid); // annulla BID
    expect(u.annullato).toBe("BID");
    expect(await (await getState(db, sid)).ultimaChiamata).toBeNull();
  });

  it("verdetto: ALZA sotto valore, TENTENNA in mezzo, MOLLA oltre tetto", async () => {
    const { db, sid } = await liveDb();
    await nominate(db, sid, 3);
    const v1 = await verdettoRialzo(db, sid, 1, 3, 1);
    expect(v1.verdetto).toBe("ALZA");
    const vt = await verdettoRialzo(db, sid, 1, 3, 33); // consigliato 28 + range 10
    expect(vt.verdetto).toBe("TENTENNA");
    const vo = await verdettoRialzo(db, sid, 1, 3, 39); // oltre 28+10 → STOP
    expect(vo.verdetto).toBe("MOLLA");
    const v2 = await verdettoRialzo(db, sid, 1, 3, 499);
    expect(v2.verdetto).toBe("MOLLA");
    expect(v2.numeri.tetto).toBeLessThan(499);
  });

  it("previsto: base mercato × momentum, non quotazione", async () => {
    const { db } = await liveDb();
    // FVM 450/2 = 225, senza storiche: neutro (caso Malen)
    const ins = await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm)
      VALUES ('test-v1',?,?,?,?,?,?,?,?)`);
    await ins.run(100, "MalenX", "malenx", "Roma", "A", "Pc", 38, 450);
    expect(await (await prezzoPrevisto(db, "test-v1", 100)).valore).toBe(225);
    // momentum up 20→30: ratio 1.5 → k 1.25
    await ins.run(101, "UpX", "upx", "Roma", "A", "Pc", 30, 200);
    await db.prepare("UPDATE players SET qt_2526=30, qt_2425=20 WHERE official_id=101").run();
    expect(await (await prezzoPrevisto(db, "test-v1", 101)).valore).toBe(125);
    // momentum down 30→10: floor 0.7
    await ins.run(102, "DownX", "downx", "Roma", "A", "Pc", 10, 200);
    await db.prepare("UPDATE players SET qt_2526=10, qt_2425=30 WHERE official_id=102").run();
    expect(await (await prezzoPrevisto(db, "test-v1", 102)).valore).toBe(70);
  });
});
