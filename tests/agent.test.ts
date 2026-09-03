import { describe, it, expect } from "vitest";
import { validateContract, extractContract, SYSTEM_PROMPT } from "../src/lib/agent";

describe("contratto agente", () => {
  it("system prompt: vincoli presenti", () => {
    for (const s of ["Non inventi MAI numeri", "decisione finale è sua", "italiano"]) {
      expect(SYSTEM_PROMPT).toMatch(s);
    }
  });
  it("valida COMPRA ok, rifiuta >3 motivazioni e azioni ignote", () => {
    const ok = { azione: "RILANCIA_FINO_A", prezzoMassimoConsigliato: 200, confidenza: "ALTA", motivazioni: ["a", "b"], alternative: ["X"], fonti: ["tettoRilancio"] };
    expect(validateContract(ok)?.azione).toBe("RILANCIA_FINO_A");
    expect(validateContract({ ...ok, azione: "HOLD" })).toBeNull();
    expect(validateContract({ ...ok, motivazioni: ["a", "b", "c", "d"] })).toBeNull();
    expect(validateContract({ ...ok, prezzoMassimoConsigliato: 12.5 })).toBeNull();
  });
  it("estrae JSON da risposta con testo", () => {
    const t = 'Prendo Malen fino a 200, decisione tua.\n```json\n{"azione":"COMPRA","prezzoMassimoConsigliato":200,"confidenza":"MEDIA","motivazioni":["titolare"],"alternative":[],"fonti":["prezzoRiferimento"]}\n```';
    expect(extractContract(t)?.prezzoMassimoConsigliato).toBe(200);
    expect(extractContract("solo testo, niente json")).toBeNull();
  });
});
