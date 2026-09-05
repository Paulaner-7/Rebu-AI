import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell } from "../src/lib/auction";
import { rebuPayload } from "../src/lib/rebu";

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
  await ins.run(2, "Altro A2", "altro a2", "Napoli", "A", "Pc", 25, 200, 26);
  await ins.run(3, "Altro A3", "altro a3", "Inter", "A", "Pc", 18, 120, 20);
  for (let i = 4; i <= 9; i++) await ins.run(i, `Riemp A${i}`, `riemp a${i}`, "Lecce", "A", "Pc", 5, null, null);
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

describe("rebuPayload", () => {
  it("payload completo: banda, stats, alternative, pericoli, rilevante", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    const p = await rebuPayload(db, sid, 1, 1);
    expect(p.giocatore.nome).toBe("Top A");
    expect(p.giocatore.banda.centro).toBe(253);
    expect(p.stats).not.toBeNull();
    expect(p.offerta).toBeNull();
    expect(p.rilevante).toBe(true);
    expect(p.slotLiberiRuolo).toBe(6);
    expect(p.alternative.length).toBeGreaterThanOrEqual(2);
    expect(p.alternative.every((a) => a.o !== 1 && a.bandaMax > 0 && typeof a.segnale === "string")).toBe(true);
    expect(p.miei.residui).toBe(500);
    expect(p.miei.slotLiberi.A).toBe(6);
    expect(p.pericoli.length).toBe(3);
    expect(p.inflazioneReparto).toBe(1);
    expect(typeof p.versione).toBe("number");
  });
  it("slot ruolo pieni: non rilevante, motivo slot", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    for (const o of [4, 5, 6, 7, 8, 9]) {
      await nominate(db, sid, o);
      await sell(db, sid, { officialId: o, managerId: 1, prezzo: 1, idem: `k${o}` });
    }
    await nominate(db, sid, 1);
    const p = await rebuPayload(db, sid, 1, 1);
    expect(p.slotLiberiRuolo).toBe(0);
    expect(p.rilevante).toBe(false);
    expect(p.motivoRilevanza).toMatch("slot");
  });
});
