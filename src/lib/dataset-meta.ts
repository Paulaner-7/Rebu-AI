// Conteggi reali ispezionati da dati/ (03-09-2026). Fase 2+ li leggerà dal DB;
// qui servono per dashboard immediata senza secret.
export const DATASET_META = {
  listone: { tutti: 533, ceduti: 57, squadre: 20 },
  guida: { titolariXI: 220, ballottaggi: 57, piazzati: 120, griglia: "20x20" },
  storiche: {
    "2022/23": 545,
    "2023/24": 539,
    "2024/25": 560,
    "2025/26": 532,
  },
  crediti: 500,
  rosa: { P: 3, D: 8, C: 8, A: 6 },
} as const;
