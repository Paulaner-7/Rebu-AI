import { describe, it, expect, vi, afterEach } from "vitest";
import { memDb } from "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell, ensureExtras } from "../src/lib/auction";
import { analisiRebu, extractRebu } from "../src/lib/rebu";

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

const OLD_KEY = process.env.OPENCODE_API_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  if (OLD_KEY === undefined) delete process.env.OPENCODE_API_KEY;
  else process.env.OPENCODE_API_KEY = OLD_KEY;
});

function aiText(prezzo: number) {
  return `RILANCIA fino a ${prezzo}.\n\`\`\`json\n{"azione":"RILANCIA_FINO_A","prezzoMassimoConsigliato":${prezzo},"confidenza":"ALTA","motivazioni":["scommessa xG"],"alternative":[],"parere":"Io lo prenderei senza esitare"}\n\`\`\``;
}
function mockAI(texto: string) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: texto } }] })));
}

describe("extractRebu", () => {
  it("parse ok + parere, rifiuta JSON rotto", () => {
    const v = extractRebu(aiText(240));
    expect(v?.prezzo).toBe(240);
    expect(v?.parere).toBe("Io lo prenderei senza esitare");
    expect(extractRebu("niente json qui")).toBeNull();
    expect(extractRebu('{"azione":"HOLD","prezzoMassimoConsigliato":1}')).toBeNull();
  });
});

describe("analisiRebu", () => {
  it("senza API key: via motore, prezzo = centro banda", async () => {
    delete process.env.OPENCODE_API_KEY;
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    const v = await analisiRebu(db, sid, 1, 1);
    expect(v.via).toBe("motore");
    expect(v.azione).toBe("RILANCIA_FINO_A");
    expect(v.prezzo).toBe(253);
    expect(v.parere).toBeNull();
  });
  it("AI ok: prezzo in banda preservato, via ai", async () => {
    process.env.OPENCODE_API_KEY = "k";
    vi.stubGlobal("fetch", mockAI(aiText(240)));
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    const v = await analisiRebu(db, sid, 1, 1);
    expect(v.via).toBe("ai");
    expect(v.prezzo).toBe(240);
    expect(v.parere).toMatch("prenderei");
    expect(v.testo).not.toMatch("```json");
  });
  it("AI spara fuori banda: clamp a max", async () => {
    process.env.OPENCODE_API_KEY = "k";
    vi.stubGlobal("fetch", mockAI(aiText(400)));
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    const v = await analisiRebu(db, sid, 1, 1);
    expect(v.via).toBe("ai");
    expect(v.prezzo).toBe(291);
  });
  it("AI errore: fallback motore", async () => {
    process.env.OPENCODE_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    const v = await analisiRebu(db, sid, 1, 1);
    expect(v.via).toBe("motore");
    expect(v.prezzo).toBe(253);
  });
  it("logga official_id + verdetto JSON in agent_runs", async () => {
    process.env.OPENCODE_API_KEY = "k";
    vi.stubGlobal("fetch", mockAI(aiText(240)));
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    await nominate(db, sid, 1);
    await analisiRebu(db, sid, 1, 1);
    const row = await db.prepare("SELECT official_id AS o, verdetto FROM agent_runs ORDER BY id DESC LIMIT 1").get() as { o: number; verdetto: string };
    expect(row.o).toBe(1);
    expect(JSON.parse(row.verdetto)).toEqual({ azione: "RILANCIA_FINO_A", prezzo: 240, via: "ai" });
  });
  it("DB legacy senza colonne: ensureExtras le aggiunge", async () => {
    const db = await memDb();
    await db.exec("ALTER TABLE agent_runs DROP COLUMN official_id");
    await db.exec("ALTER TABLE agent_runs DROP COLUMN verdetto");
    await ensureExtras(db);
    const cols = await db.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("official_id");
    expect(cols.map((c) => c.name)).toContain("verdetto");
  });
  it("nomination irrilevante: niente fetch, PASSA; con forza: fetch parte", async () => {
    process.env.OPENCODE_API_KEY = "k";
    const db = await dbF();
    const sid = await setupLeague(db, OTTO); await startAuction(db, sid, 0);
    for (const o of [4, 5, 6, 7, 8, 9]) {
      await nominate(db, sid, o);
      await sell(db, sid, { officialId: o, managerId: 1, prezzo: 1, idem: `k${o}` });
    }
    await nominate(db, sid, 1);
    const f1 = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f1);
    const v = await analisiRebu(db, sid, 1, 1);
    expect(f1).not.toHaveBeenCalled();
    expect(v.via).toBe("motore");
    expect(v.azione).toBe("PASSA");
    const f2 = mockAI(aiText(100));
    vi.stubGlobal("fetch", f2);
    const v2 = await analisiRebu(db, sid, 1, 1, { forza: true });
    expect(f2).toHaveBeenCalledTimes(1);
    expect(v2.via).toBe("ai");
  });
});
