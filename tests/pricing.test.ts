import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell } from "../src/lib/auction";
import { prezzoRiferimento, tettoRilancio, inflazioneAsta, tettoConsigliato, prossimeChiamate, matriceLega } from "../src/lib/pricing";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const OTTO = Array.from({ length: 8 }, (_, i) => ({ nome: `M${i+1}`, nome_squadra: "", note: "", is_owner: i === 0 }));

function dbF() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  const set = db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti","500"],["rosa_P","3"],["rosa_D","8"],["rosa_C","8"],["rosa_A","6"],
      ["modo","classic"],["modificatore_default","on"],["ordine_reparti","P,D,C,A"],["dataset_attivo","t"]]) set.run(k, v);
  const ins = db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, is_titolare, qt_2526)
    VALUES ('t',?,?,?,?,?,?,?, ?,0,?)`);
  ins.run(1, "Top A", "top a", "Roma", "A", "Pc", 38, 450, 40);   // rif 225
  ins.run(2, "Mid C", "mid c", "Como", "C", "X", 20, null, 22);    // rif mediana(22 Qt25/26, 20 Qt.A)=21
  ins.run(3, "Low D", "low d", "Lecce", "D", "Dc", 5, null, null); // rif media reparto
  ins.run(4, "Top D", "top d", "Inter", "D", "E", 31, 240, 30);    // mod boost
  for (let i = 5; i <= 40; i++) ins.run(i, `Riemp ${i}`, `riemp ${i}`, "Napoli", i % 2 ? "C" : "D", "X", 5, null, null);
  return db;
}

describe("motore prezzi", () => {
  it("riferimento: FVM/2, poi storiche, poi media reparto", () => {
    const db = dbF();
    const a = prezzoRiferimento(db, "t", 1);
    expect(a.valore).toBe(225); expect(a.formula).toMatch("FVM / 2");
    const b = prezzoRiferimento(db, "t", 2);
    expect(b.valore).toBe(21);
    const c = prezzoRiferimento(db, "t", 3);
    expect(c.formula).toMatch("media");
  });
  it("tetto rosa vuota 476; dopo acquisto scala", () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO); startAuction(db, sid, 0);
    expect(tettoRilancio(db, sid, 1, 1).tetto).toBe(476);
    nominate(db, sid, 1); sell(db, sid, { officialId: 1, managerId: 1, prezzo: 100, idem: "k" });
    expect(tettoRilancio(db, sid, 1, 2).tetto).toBe(500 - 100 - 23);
  });
  it("inflazione: neutra 1.0, poi 2.0 dopo strapagamento", () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO); startAuction(db, sid, 0);
    expect(inflazioneAsta(db, sid).reparti.A.valore).toBe(1);
    nominate(db, sid, 1); sell(db, sid, { officialId: 1, managerId: 1, prezzo: 450, idem: "k" }); // rif 225
    expect(inflazioneAsta(db, sid).reparti.A.valore).toBe(2);
    const tc = tettoConsigliato(db, sid, 2, 1);
    expect(tc.consigliato).toBe(Math.min(450, tc.tettoMax));
  });
  it("ranking: buco rosa prima, bonus modificatore su top D", () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO); startAuction(db, sid, 0);
    const r = prossimeChiamate(db, sid, 1, 3);
    expect(r.modificatore).toBe("on");
    expect(r.top[0].ruolo).toBe("D"); // 8 slot vuoti battono altre esigenze
    expect(r.top.every((x) => typeof x.score === "number" && x.motivi.length > 0)).toBe(true);
  });
  it("matrice: 8 righe, conti tornano", () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO); startAuction(db, sid, 0);
    nominate(db, sid, 1); sell(db, sid, { officialId: 1, managerId: 1, prezzo: 100, idem: "k" });
    const m = matriceLega(db, sid);
    expect(m.righe.length).toBe(8);
    expect(m.righe[0].residui).toBe(400);
    expect(m.righe[0].buchi).toEqual({ P: 3, D: 8, C: 8, A: 5 });
  });
});
