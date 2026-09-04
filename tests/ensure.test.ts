import { describe, it, expect } from "vitest";
import { memDb } from "./helpers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ensureDataset } from "../src/lib/ensure-dataset";
import { getDatasetInfo } from "../src/lib/store";

const DB = join(process.cwd(), ".data", "rebu.db");

describe("auto-import dataset", () => {
  it("DB aggiornato: nessun import, nessuna eccezione", async () => {
    if (!existsSync(DB)) return; // CI senza dati/: skip, mai triggerare import qui
    const r = ensureDataset();
    expect(r.ok).toBe(true);
    expect(r.didImport).toBe(false);
  });

  it("throttle: seconda chiamata usa cache", async () => {
    if (!existsSync(DB)) return;
    const a = ensureDataset();
    const b = ensureDataset();
    expect(b).toEqual(a);
  });

  it("conteggi reali disponibili", async () => {
    if (!existsSync(DB)) return;
    const info = await getDatasetInfo();
    expect(info).not.toBeNull();
    expect(info!.totale).toBeGreaterThan(400);
    expect(info!.squadre).toBe(20);
  });
});
