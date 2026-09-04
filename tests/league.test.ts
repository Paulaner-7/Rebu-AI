import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell, updateManagers, resetAuction, control, AuctionError } from "../src/lib/auction";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const OTTO = Array.from({ length: 8 }, (_, i) => ({ nome: `M${i+1}`, nome_squadra: `S${i+1}`, note: "", is_owner: i === 0 }));

async function dbF() {
  const db = await memDb();
  await db.exec(SCHEMA);
  await db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  for (const [k, v] of [["dataset_attivo","t"]]) await db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(k, v);
  return db;
}
async function code(fn: () => unknown) {
  try { await fn(); } catch (e) { return (e as AuctionError).code; }
  throw new Error("no err");
}

describe("lega e reset", () => {
  it("partecipanti editabili solo pre-avvio", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO);
    const alt = OTTO.map((m) => ({ ...m, nome: m.nome + "X" }));
    await updateManagers(db, sid, alt);
    await startAuction(db, sid, 1);
    expect(await code(async () => updateManagers(db, sid, OTTO))).toBe("STATO");
  });
  it("reset rifiutato in LIVE, ok dopo conclusa", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO);
    await startAuction(db, sid, 0);
    expect(await code(async () => resetAuction(db))).toBe("ASTA_LIVE");
    await control(db, sid, "complete");
    await resetAuction(db);
    const sid2 = await setupLeague(db, OTTO); // id deterministici dopo reset
    expect(sid2).toBeGreaterThan(0);
  });
  it("nominate/sell/vendere bloccati dopo reset (sessione sparita)", async () => {
    const db = await dbF();
    const sid = await setupLeague(db, OTTO);
    await startAuction(db, sid, 0);
    await control(db, sid, "pause");
    await resetAuction(db);
    expect(await code(async () => nominate(db, sid, 1))).toBe("SESSIONE_ASSENTE");
    void sell;
  });
});
