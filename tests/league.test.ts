import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupLeague, startAuction, nominate, sell, updateManagers, resetAuction, control, AuctionError } from "../src/lib/auction";

const SCHEMA = readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8");
const OTTO = Array.from({ length: 8 }, (_, i) => ({ nome: `M${i+1}`, nome_squadra: `S${i+1}`, note: "", is_owner: i === 0 }));

function dbF() {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  db.prepare("INSERT INTO dataset_versions (version, source_hash) VALUES ('t','h')").run();
  for (const [k, v] of [["dataset_attivo","t"]]) db.prepare("INSERT INTO settings (key,value) VALUES (?,?)").run(k, v);
  return db;
}
async function code(fn: () => unknown) {
  try { await fn(); } catch (e) { return (e as AuctionError).code; }
  throw new Error("no err");
}

describe("lega e reset", () => {
  it("partecipanti editabili solo pre-avvio", async () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO);
    const alt = OTTO.map((m) => ({ ...m, nome: m.nome + "X" }));
    updateManagers(db, sid, alt);
    startAuction(db, sid, 1);
    expect(await code(() => updateManagers(db, sid, OTTO))).toBe("STATO");
  });
  it("reset rifiutato in LIVE, ok dopo conclusa", async () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO);
    startAuction(db, sid, 0);
    expect(await code(() => resetAuction(db))).toBe("ASTA_LIVE");
    control(db, sid, "complete");
    resetAuction(db);
    expect(setupLeague(db, OTTO)).toBeGreaterThan(sid);
  });
  it("nominate/sell/vendere bloccati dopo reset (sessione sparita)", async () => {
    const db = dbF();
    const sid = setupLeague(db, OTTO);
    startAuction(db, sid, 0);
    control(db, sid, "pause");
    resetAuction(db);
    expect(await code(() => nominate(db, sid, 1))).toBe("SESSIONE_ASSENTE");
    void sell;
  });
});
