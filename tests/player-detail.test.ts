import { describe, it, expect } from "vitest";
import { getPlayerDetail } from "../src/lib/store";
import { fmt, deltaTone } from "../src/lib/player-ui";

describe("scheda giocatore", () => {
  it("id ignoto: null senza crash (DB assente o fuori dataset)", () => {
    expect(getPlayerDetail(999999999)).toBeNull();
    expect(getPlayerDetail(NaN)).toBeNull();
  });

  it("fmt: null -> em dash, numeri intatti", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt(7)).toBe("7");
    expect(fmt(6.51, 2)).toBe("6.51");
  });

  it("deltaTone: soglie KB-STA-01", () => {
    expect(deltaTone(1.2)).toBe("sovra");
    expect(deltaTone(-2)).toBe("sotto");
    expect(deltaTone(0.2)).toBe("linea");
    expect(deltaTone(null)).toBe("vuoto");
  });
});
