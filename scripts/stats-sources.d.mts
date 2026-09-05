declare const _s: {
  norm(s: unknown): string;
  sleep(ms: number): Promise<void>;
  fetchUnderstat(stagione: string): Promise<Record<string, unknown>[]>;
  fetchFantacalcio(stagione: string): Promise<Record<string, unknown>[]>;
  makeTrovaOfficialId(attivi: { official_id: number; nome_norm: string; squadra: string }[]): (r: Record<string, unknown>) => number | null;
  COLS: string[];
};
export = _s;
