import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  setupLeague, startAuction, nominate, sell, markUnsold, undoLast, control,
  getState, rebuildCheck, ruoloCorrente, AuctionError,
} from "../src/lib/auction";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const RUOLI: Record<string, number> = { P: 30, D: 70, C: 70, A: 60 };

async function freshDb() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('test-v1','h')").run();
  const set = await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo","test-v1"]]) await set.run(k, v);
  const ins = await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm)
    VALUES ('test-v1',?,?,?,?,?,?,?,?)`);
  let id = 1;
  for (const [ruolo, n] of Object.entries(RUOLI)) {
    for (let i = 1; i <= n; i++, id++) await ins.run(id, `G${ruolo}${i}`, `g${ruolo}${i}`, `Sq${i % 20}`, ruolo, "X", 10, 50);
  }
  return db;
}

const OTTO = Array.from({ length: 8 }, (_, i) => ({
  nome: `Mister ${i + 1}`, nome_squadra: `Team ${i + 1}`, note: "", is_owner: i === 0,
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

describe("setup", () => {
  it("rifiuta != 8 e duplicati", async () => {
    const db = await freshDb();
    expect((await errOf(() => setupLeague(db, OTTO.slice(0, 7)))).code).toBe("MANAGERS");
    const dup = [...OTTO]; dup[1] = { ...dup[1], nome: "Mister 1" };
    expect((await errOf(() => setupLeague(db, dup))).code).toBe("MANAGERS");
  });
  it("rifiuta seconda asta aperta", async () => {
    const db = await freshDb();
    await setupLeague(db, OTTO);
    expect((await errOf(() => setupLeague(db, OTTO))).code).toBe("ASTA_APERTA");
  });
});

describe("asta completa 8 squadre", () => {
  it("ruoloCorrente avanza P→D quando tutti completano P", async () => {
    const { db, sid } = await liveDb();
    expect(await ruoloCorrente(db, sid)).toBe("P");
    let oid = 1;
    for (let m = 1; m <= 8; m++) for (let k = 0; k < 3; k++) {
      await nominate(db, sid, oid);
      await sell(db, sid, { officialId: oid, managerId: m, prezzo: 1, idem: `rp${oid}` });
      oid++;
    }
    expect(await ruoloCorrente(db, sid)).toBe("D");
  });
  it("200 acquisti a 1 credito: rose esatte, crediti mai negativi, rebuild ok", async () => {
    const { db, sid } = await liveDb();
    const need: Record<string, number> = { P: 3, D: 8, C: 8, A: 6 };
    let k = 0;
    for (const ruolo of ["P", "D", "C", "A"]) {
      const ids = (await db.prepare("SELECT official_id AS o FROM players WHERE ruolo_classic=? ORDER BY official_id").all(ruolo) as { o: number }[]).map((r) => r.o);
      let p = 0;
      for (let m = 1; m <= 8; m++) {
        for (let s = 0; s < need[ruolo]; s++) {
          const oid = ids[p++];
          await nominate(db, sid, oid);
          await sell(db, sid, { officialId: oid, managerId: m, prezzo: 1, idem: `k${k++}` });
        }
      }
    }
    const st = await getState(db, sid);
    expect(st.acquisti).toBe(200);
    for (const m of st.managers) {
      expect(m.slot.P.usati).toBe(3); expect(m.slot.D.usati).toBe(8);
      expect(m.slot.C.usati).toBe(8); expect(m.slot.A.usati).toBe(6);
      expect(m.residui).toBe(475);
    }
    expect(await (await rebuildCheck(db, sid)).ok).toBe(true);
  });
});

describe("regole ferree", () => {
  it("doppio acquisto stesso giocatore rifiutato", async () => {
    const { db, sid } = await liveDb();
    await nominate(db, sid, 1);
    await sell(db, sid, { officialId: 1, managerId: 1, prezzo: 5, idem: "a1" });
    expect((await errOf(() => sell(db, sid, { officialId: 1, managerId: 2, prezzo: 5, idem: "a2" }))).code).toBe("GIA_ASSEGNATO");
  });
  it("stessa chiave idempotenza = un solo acquisto", async () => {
    const { db, sid } = await liveDb();
    await nominate(db, sid, 1);
    const r1 = await sell(db, sid, { officialId: 1, managerId: 1, prezzo: 5, idem: "dup" });
    const r2 = await sell(db, sid, { officialId: 1, managerId: 1, prezzo: 5, idem: "dup" });
    expect(r2.duplicato).toBe(true);
    expect(await (await getState(db, sid)).acquisti).toBe(1);
    expect(r1.duplicato).toBe(false);
  });
  it("slot ruolo esaurito rifiutato", async () => {
    const { db, sid } = await liveDb();
    for (let i = 1; i <= 3; i++) { await nominate(db, sid, i); await sell(db, sid, { officialId: i, managerId: 1, prezzo: 1, idem: `p${i}` }); }
    await nominate(db, sid, 4);
    expect((await errOf(() => sell(db, sid, { officialId: 4, managerId: 1, prezzo: 1, idem: "p4" }))).code).toBe("SLOT_ESAURITO");
  });
  it("tetto crediti: max primo acquisto 476, poi 1", async () => {
    const { db, sid } = await liveDb();
    await nominate(db, sid, 1);
    await sell(db, sid, { officialId: 1, managerId: 1, prezzo: 476, idem: "big" });
    await nominate(db, sid, 2);
    expect((await errOf(() => sell(db, sid, { officialId: 2, managerId: 1, prezzo: 2, idem: "big2" }))).code).toBe("CREDITI_INSUFFICIENTI");
    await nominate(db, sid, 2);
    await sell(db, sid, { officialId: 2, managerId: 1, prezzo: 1, idem: "big3" });
    expect(await (await getState(db, sid)).managers[0].residui).toBe(23);
  });
  it("invenduto resta disponibile + undo ripristina", async () => {
    const { db, sid } = await liveDb();
    await nominate(db, sid, 1);
    await markUnsold(db, sid, 1);
    await nominate(db, sid, 1); // rinomina ok
    await sell(db, sid, { officialId: 1, managerId: 2, prezzo: 10, idem: "u1" });
    expect(await (await getState(db, sid)).managers[1].residui).toBe(490);
    await undoLast(db, sid);
    let st = await getState(db, sid);
    expect(st.managers[1].residui).toBe(500);
    expect(st.acquisti).toBe(0);
    await undoLast(db, sid); // annulla anche la nomina sottostante
    st = await getState(db, sid);
    expect(st.nomination).toBeNull();
    expect(await (await rebuildCheck(db, sid)).ok).toBe(true);
  });
  it("versione conflittuale rifiutata", async () => {
    const { db, sid } = await liveDb();
    expect((await errOf(() => nominate(db, sid, 1, 999))).code).toBe("CONFLITTO");
  });
  it("pausa blocca nomine, conclusa blocca vendite", async () => {
    const { db, sid } = await liveDb();
    await control(db, sid, "pause");
    expect((await errOf(() => nominate(db, sid, 1))).code).toBe("STATO");
    await control(db, sid, "resume");
    await nominate(db, sid, 1);
    await control(db, sid, "complete");
    expect((await errOf(() => sell(db, sid, { officialId: 1, managerId: 1, prezzo: 1, idem: "x" }))).code).toBe("STATO");
  });
});
