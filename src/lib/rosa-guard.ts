// Rebu AI — guard rosa 2026/27: nessun nome fuori dataset.
// La chat suggeriva alternative non in Serie A: ora ogni nome in uscita
// viene verificato contro players@dataset_attivo. Stagioni passate = spunto,
// mai verdetto: il presente 26/27 comanda (v. SYSTEM_PROMPT).
import type { Db } from "./pgdb";

export function normalizzaNome(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.'’‘`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type VerificaRiga = {
  input: string;
  official_id: number;
  nome: string;
  squadra: string;
  ruolo: string;
};

// Ogni nome -> riga dataset (match esatto nome_norm, fallback contains).
// Ritorna trovati + ignoti: gli ignoti vanno scartati, mai suggeriti.
export async function verificaNomi(
  db: Db, dataset: string, nomi: string[]
): Promise<{ trovati: VerificaRiga[]; ignoti: string[] }> {
  const trovati: VerificaRiga[] = [];
  const ignoti: string[] = [];
  const qEsatto = db.prepare(
    "SELECT official_id, nome, squadra, ruolo_classic AS ruolo FROM players WHERE dataset_version=? AND nome_norm=?"
  );
  const qContains = db.prepare(
    "SELECT official_id, nome, squadra, ruolo_classic AS ruolo FROM players WHERE dataset_version=? AND nome_norm LIKE ? LIMIT 5"
  );
  for (const raw of nomi) {
    const input = String(raw ?? "").trim();
    if (!input) continue;
    const n = normalizzaNome(input);
    if (!n) { ignoti.push(input); continue; }
    const e = (await qEsatto.get(dataset, n)) as Omit<VerificaRiga, "input"> | undefined;
    if (e) { trovati.push({ input, ...e }); continue; }
    const c = (await qContains.all(dataset, `%${n}%`)) as Omit<VerificaRiga, "input">[];
    if (c.length === 1 && c[0]) trovati.push({ input, ...c[0] });
    else ignoti.push(input);
  }
  return { trovati, ignoti };
}

// Filtra alternative AI ai soli nomi canonici in dataset. Droppa il resto.
export async function filtraAlternativeValide(db: Db, dataset: string, alt: string[]): Promise<string[]> {
  if (!alt?.length) return [];
  return (await verificaNomi(db, dataset, alt)).trovati.map((t) => t.nome);
}
