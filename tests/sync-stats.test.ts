import { describe, it, expect, vi, afterEach } from "vitest";
import { memDb } from "./helpers";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { syncStats } from "../src/lib/sync-stats";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");

const FC_HTML = `<table>
<tr class="player-row"><th class="player-name"><a class="player-link" href="/it/serie-a/squadre/roma/top-a/1/2026-27"><span>Top A</span></a></th>
<td><span class="player-role-classic" data-value="a">A</span></td>
<td data-col-key="sq">ROM</td><td data-col-key="pg">6</td><td data-col-key="mv">6,50</td>
<td data-col-key="mfv">6,60</td><td data-col-key="gol">2</td><td data-col-key="gs">0</td>
<td data-col-key="rig">0 / 0</td><td data-col-key="rp">0</td><td data-col-key="ass">1</td>
<td data-col-key="amm">1</td><td data-col-key="esp">0</td></tr></table>`;

afterEach(() => vi.unstubAllGlobals());

async function dbF() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  await db.prepare("INSERT INTO settings (key,value) VALUES ('dataset_attivo','t')").run();
  await db.prepare(`INSERT INTO players (dataset_version, official_id, nome, nome_norm, squadra, ruolo_classic, qt_a, fvm)
    VALUES ('t',1,'Top A','top a','Roma','A',38,450)`).run();
  return db;
}

function mockSources() {
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
    if (String(url).includes("understat")) {
      return new Response(JSON.stringify({ players: [{
        player_name: "Top A", team_title: "Roma", position: "Forward", games: 6, time: 500,
        goals: 2, assists: 1, xG: 3.1, xA: 0.8, npxG: 2.5, shots: 15, key_passes: 8,
        yellow_cards: 1, red_cards: 0,
      }] }));
    }
    return new Response(FC_HTML);
  }));
}

describe("syncStats", () => {
  it("scrive 2 righe joinate, seconda corsa idempotente", async () => {
    mockSources();
    const db = await dbF();
    const r1 = await syncStats(db, { seasons: ["2026-27"], source: "all" });
    expect(r1.jobs.map((j) => j.stato)).toEqual(["ok", "ok"]);
    const rows = await db.prepare("SELECT fonte, official_id, fantamedia, xg FROM player_stats ORDER BY fonte").all() as
      { fonte: string; official_id: number; fantamedia: number | null; xg: number | null }[];
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.official_id === 1)).toBe(true);
    expect(rows.find((r) => r.fonte === "fantacalcio")?.fantamedia).toBe(6.6);
    expect(rows.find((r) => r.fonte === "understat")?.xg).toBe(3.1);
    const r2 = await syncStats(db, { seasons: ["2026-27"], source: "all" });
    expect(r2.jobs.map((j) => j.stato)).toEqual(["idem", "idem"]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM player_stats").get() as { n: number }).n).toBe(2);
  });
  it("fonte giu: skip senza rompere altra fonte", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      if (String(url).includes("understat")) throw new Error("down");
      return new Response(FC_HTML);
    }));
    const db = await dbF();
    const r = await syncStats(db, { seasons: ["2026-27"], source: "all" });
    expect(r.jobs[0].stato).toBe("skip");
    expect(r.jobs[1].stato).toBe("ok");
  });
});
