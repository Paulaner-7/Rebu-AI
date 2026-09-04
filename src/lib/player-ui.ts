// Rebu AI — micro-helper UI scheda giocatore (FotMob-style, puri e testabili).
export function fmt(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return digits > 0 ? v.toFixed(digits) : String(v);
}

// Tono scarto gol−xG: soglie condivise con KB-STA-01.
export function deltaTone(s: number | null | undefined): "sovra" | "sotto" | "linea" | "vuoto" {
  if (s === null || s === undefined) return "vuoto";
  if (s > 0.5) return "sovra";
  if (s < -0.5) return "sotto";
  return "linea";
}

export const DELTA_LABEL: Record<ReturnType<typeof deltaTone>, string> = {
  sovra: "sovrarendimento",
  sotto: "possibile scommessa",
  linea: "in linea",
  vuoto: "dato assente",
};
