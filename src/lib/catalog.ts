import type { DatabaseSync } from "node:sqlite";

// Catalogo live: disponibili = nel dataset congelato e non venduti in sessione.
// Ricerca min 3 caratteri, max 20 risultati, ordinati per quotazione.
export type Found = {
  official_id: number; nome: string; squadra: string;
  ruolo: string; ruolo_mantra: string; qt: number | null; fvm: number | null; titolare: number;
};

export function searchAvailable(
  db: DatabaseSync, sid: number, dataset: string,
  q: string, ruolo = "", squadra = ""
): Found[] {
  const query = q.trim().toLowerCase();
  if (query.length < 3) return [];
  const like = `%${query}%`;
  return db.prepare(
    `SELECT p.official_id, p.nome, p.squadra, p.ruolo_classic AS ruolo, p.ruolo_mantra,
            p.qt_a AS qt, p.fvm, p.is_titolare AS titolare
     FROM players p
     WHERE p.dataset_version = ?
       AND (lower(p.nome) LIKE ? OR lower(p.squadra) LIKE ?)
       AND (? = '' OR p.ruolo_classic = ?)
       AND (? = '' OR p.squadra = ?)
       AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.session_id = ? AND pu.player_id = p.id)
     ORDER BY p.qt_a DESC LIMIT 20`
  ).all(dataset, like, like, ruolo, ruolo, squadra, squadra, sid) as Found[];
}
