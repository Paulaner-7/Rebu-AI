import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction } from "../src/lib/auction";
import { fattoreStats, bandaGiocatore } from "../src/lib/pricing";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const OTTO = Array.from({ length: 8 }, (_, i) => ({ nome: `M${i + 1}`, nome_squadra: "", note: "", is_owner: i === 0 }));

async function dbF() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  const set = await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)");
  for (const [k, v] of [["crediti", "500"], ["rosa_P", "3"], ["rosa_D", "8"], ["rosa_C", "8"], ["rosa_A", "6"],
    ["modo", "classic"], ["modificatore_default", "on"], ["ordine_reparti", "P,D,C,A"], ["dataset_attivo", "t"]]) await set.run(k, v);
  const ins = await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, ruolo_mantra, qt_a, fvm, is_titolare, qt_2526)
    VALUES ('t',?,?,?,?,?,?,?, ?,0,?)`);
  await ins.run(1, "Top A", "top a", "Roma", "A", "Pc", 38, 450, 40);
  await ins.run(2, "Mid C", "mid c", "Como", "C", "X", 20, null, 22);
  // Stats Top A: scommessa xG (gol 23 vs xG 28.6), live FM 6.6, rigorista
  const st = await db.prepare(`INSERT INTO player_stats (stagione, fonte, official_id, nome, nome_norm, squadra, ruolo, presenze, gol, fantamedia, rigori_segnati, xg)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  await st.run("2024-25", "fantacalcio", 1, "Top A", "top a", "roma", "A", 34, 12, 7.1, 3, null);
  await st.run("2024-25", "understat", 1, "Top A", "top a", "roma", "A", 34, null, null, null, 14.5);
  await st.run("2025-26", "fantacalcio", 1, "Top A", "top a", "roma", "A", 30, 9, 6.8, 2, null);
  await st.run("2025-26", "understat", 1, "Top A", "top a", "roma", "A", 30, null, null, null, 11.0);
  await st.run("2026-27", "fantacalcio", 1, "Top A", "top a", "roma", "A", 6, 2, 6.6, 0, null);
  await st.run("2026-27", "understat", 1, "Top A", "top a", "roma", "A", 6, null, null, null, 3.1);
  return db;
}

describe("fattoreStats (puro)", () => {
  it("scommessa xG + forma + rigorista: k=1.124", () => {
    const f = fattoreStats({ stagioni_coperte: 3, scarto_gol_meno_xg: -5.6, live_fantamedia: 6.6, live_presenze: 6, presenze_medie: 70 / 3, rigori_segnati: 5 });
    expect(f.k).toBe(1.124);
    expect(f.segnali.map((s) => s.id)).toEqual(["scarto_xg", "forma_live", "affidabilita", "rigorista"]);
  });
  it("trappola: sovrarendimento + forma bassa + fragile, clamp 0.85", () => {
    const f = fattoreStats({ stagioni_coperte: 3, scarto_gol_meno_xg: 6, live_fantamedia: 5.8, live_presenze: 6, presenze_medie: 15, rigori_segnati: 0 });
    expect(f.k).toBe(0.85);
    expect(f.segnali.find((s) => s.id === "scarto_xg")?.effetto).toBe(0.93);
  });
  it("tutto positivo: clamp 1.15", () => {
    const f = fattoreStats({ stagioni_coperte: 3, scarto_gol_meno_xg: -9, live_fantamedia: 7.5, live_presenze: 8, presenze_medie: 36, rigori_segnati: 6 });
    expect(f.k).toBe(1.15);
  });
  it("meno di 2 stagioni: neutro con segnale assenti", () => {
    const f = fattoreStats({ stagioni_coperte: 1, scarto_gol_meno_xg: 0, live_fantamedia: null, live_presenze: null, presenze_medie: null, rigori_segnati: 0 });
    expect(f.k).toBe(1);
    expect(f.segnali[0].id).toBe("assenti");
  });
});

describe("bandaGiocatore (integrazione)", () => {
  it("Top A: centro 253, banda 215-291, k 1.124", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    const b = await bandaGiocatore(db, sid, 1, 1);
    expect(b.consigliatoBase).toBe(225);
    expect(b.kStats).toBe(1.124);
    expect(b.centro).toBe(253);
    expect(b.min).toBe(215);
    expect(b.max).toBe(291);
    expect(b.max).toBeLessThanOrEqual(b.tettoMax);
  });
  it("senza stats: banda neutra attorno al consigliato", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    const b = await bandaGiocatore(db, sid, 1, 2);
    expect(b.kStats).toBe(1);
    expect(b.centro).toBe(b.consigliatoBase);
    expect(b.min).toBe(Math.round(b.centro * 0.85));
  });
});
