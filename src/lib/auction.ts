import type { DatabaseSync } from "node:sqlite";

// Motore deterministico d'asta. Solo conti, mai LLM.
// Riceve handle DB (transazioni atomiche qui dentro). Errori via AuctionError.

export class AuctionError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type ManagerInput = { nome: string; nome_squadra: string; note: string; is_owner: boolean };

const FALLBACK = { crediti: 500, rosa: { P: 3, D: 8, C: 8, A: 6 } as Record<string, number> };

function settingsMap(db: DatabaseSync): Map<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return new Map(rows.map((r) => [r.key, r.value]));
}

export function leagueRules(db: DatabaseSync) {
  const s = settingsMap(db);
  const rosa: Record<string, number> = {
    P: Number(s.get("rosa_P") ?? FALLBACK.rosa.P),
    D: Number(s.get("rosa_D") ?? FALLBACK.rosa.D),
    C: Number(s.get("rosa_C") ?? FALLBACK.rosa.C),
    A: Number(s.get("rosa_A") ?? FALLBACK.rosa.A),
  };
  return { crediti: Number(s.get("crediti") ?? FALLBACK.crediti), rosa };
}

export function ensureExtras(db: DatabaseSync) {
  const cols = db.prepare("PRAGMA table_info(auction_sessions)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "current_nomination")) {
    db.exec("ALTER TABLE auction_sessions ADD COLUMN current_nomination INTEGER");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS preferenze (
    dataset_version TEXT NOT NULL REFERENCES dataset_versions(version),
    official_id INTEGER NOT NULL, tipo TEXT NOT NULL CHECK (tipo IN ('W','X')), nota TEXT DEFAULT '',
    PRIMARY KEY (dataset_version, official_id))`);
}

export function setPreferenza(db: DatabaseSync, dataset: string, officialId: number, tipo: "W" | "X" | null) {
  if (tipo === null) {
    db.prepare("DELETE FROM preferenze WHERE dataset_version=? AND official_id=?").run(dataset, officialId);
    return;
  }
  db.prepare("INSERT INTO preferenze (dataset_version, official_id, tipo) VALUES (?,?,?) ON CONFLICT(dataset_version, official_id) DO UPDATE SET tipo=excluded.tipo").run(dataset, officialId, tipo);
}

export function getPreferenze(db: DatabaseSync, dataset: string): Map<number, string> {
  const rows = db.prepare("SELECT official_id AS o, tipo FROM preferenze WHERE dataset_version=?").all(dataset) as { o: number; tipo: string }[];
  return new Map(rows.map((r) => [r.o, r.tipo]));
}

type Session = {
  id: number; dataset_version: string; stato: string;
  reparto_corrente: string | null; state_version: number; current_nomination: number | null;
};

function getSession(db: DatabaseSync, id: number): Session {
  const r = db.prepare("SELECT * FROM auction_sessions WHERE id = ?").get(id) as Session | undefined;
  if (!r) throw new AuctionError("SESSIONE_ASSENTE", `Sessione ${id} assente`, 404);
  return r;
}

function checkVersion(s: Session, expected: number | undefined) {
  if (expected !== undefined && expected !== s.state_version) {
    throw new AuctionError("CONFLITTO", `Stato cambiato (atteso v${expected}, ora v${s.state_version}). Ricarica.`);
  }
}

function nextSeq(db: DatabaseSync, sid: number): number {
  const r = db.prepare("SELECT COALESCE(MAX(seq),0) AS m FROM auction_events WHERE session_id=?").get(sid) as { m: number };
  return r.m + 1;
}

function pushEvent(
  db: DatabaseSync, sid: number, tipo: string, payload: object,
  idem?: string | null, compId?: number | null
): number {
  const seq = nextSeq(db, sid);
  try {
    const r = db.prepare(
      "INSERT INTO auction_events (session_id, seq, tipo, payload, idempotency_key, compensates_id) VALUES (?,?,?,?,?,?)"
    ).run(sid, seq, tipo, JSON.stringify(payload), idem ?? null, compId ?? null);
    return Number(r.lastInsertRowid);
  } catch {
    throw new AuctionError("IDEMPOTENZA", "Operazione già registrata (doppio invio ignorato).");
  }
}

function bump(db: DatabaseSync, s: Session): number {
  const v = s.state_version + 1;
  db.prepare("UPDATE auction_sessions SET state_version=? WHERE id=?").run(v, s.id);
  s.state_version = v;
  return v;
}

function playerInDataset(db: DatabaseSync, dataset: string, officialId: number) {
  const p = db.prepare(
    "SELECT id, nome, squadra, ruolo_classic FROM players WHERE dataset_version=? AND official_id=?"
  ).get(dataset, officialId) as
    | { id: number; nome: string; squadra: string; ruolo_classic: string }
    | undefined;
  if (!p) throw new AuctionError("GIOCATORE_ASSENTE", `Id ${officialId} fuori dataset congelato.`);
  return p;
}

function soldTo(db: DatabaseSync, sid: number, playerRowId: number) {
  return db.prepare("SELECT * FROM purchases WHERE session_id=? AND player_id=?").get(sid, playerRowId) as
    | { manager_id: number; prezzo: number }
    | undefined;
}

export type ManagerState = {
  id: number; nome: string; nome_squadra: string; is_owner: number;
  crediti_iniziali: number; speso: number; residui: number;
  slot: Record<string, { usati: number; totali: number }>;
  rosa: { nome: string; squadra: string; ruolo: string; prezzo: number }[];
  maxSpesa: number; // tetto prossimo acquisto lasciando 1 credito per slot vuoti
};

export function managerStates(db: DatabaseSync, sid: number): ManagerState[] {
  const { crediti, rosa } = leagueRules(db);
  const mans = db.prepare("SELECT * FROM managers ORDER BY id").all() as {
    id: number; nome: string; nome_squadra: string; is_owner: number; crediti_iniziali: number;
  }[];
  return mans.map((m) => {
    const rows = db.prepare(
      `SELECT pl.nome, pl.squadra, pl.ruolo_classic AS ruolo, pu.prezzo
       FROM purchases pu JOIN players pl ON pl.id = pu.player_id
       WHERE pu.session_id=? AND pu.manager_id=? ORDER BY pu.id`
    ).all(sid, m.id) as { nome: string; squadra: string; ruolo: string; prezzo: number }[];
    const speso = rows.reduce((a, r) => a + r.prezzo, 0);
    const slot: ManagerState["slot"] = {};
    for (const [ruolo, totali] of Object.entries(rosa)) {
      slot[ruolo] = { usati: rows.filter((r) => r.ruolo === ruolo).length, totali };
    }
    const vuoti = Object.values(slot).reduce((a, s) => a + (s.totali - s.usati), 0);
    const base = m.crediti_iniziali || crediti;
    return {
      id: m.id, nome: m.nome, nome_squadra: m.nome_squadra, is_owner: m.is_owner,
      crediti_iniziali: base, speso, residui: base - speso, slot, rosa: rows,
      maxSpesa: base - speso - (vuoti - 1),
    };
  });
}

// Ruolo corrente asta: primo reparto in ordine dove almeno una squadra ha slot
// liberi. Tutti completi P → si passa a D, poi C, poi A. Null = rose complete.
export function ruoloCorrente(db: DatabaseSync, sid: number): string | null {
  const ord = db.prepare("SELECT value FROM settings WHERE key='ordine_reparti'").get() as { value: string } | undefined;
  const ruoli = (ord?.value ?? "P,D,C,A").split(",").map((r) => r.trim()).filter(Boolean);
  const ms = managerStates(db, sid);
  for (const r of ruoli) {
    if (ms.some((m) => (m.slot[r]?.usati ?? 0) < (m.slot[r]?.totali ?? 0))) return r;
  }
  return null;
}

export function getState(db: DatabaseSync, sid: number) {
  ensureExtras(db);
  const s = getSession(db, sid);
  const nomination = s.current_nomination
    ? (db.prepare("SELECT official_id AS o, nome, squadra, ruolo_classic AS ruolo FROM players WHERE id=?").get(
        s.current_nomination
      ) as { o: number; nome: string; squadra: string; ruolo: string } | undefined)
    : null;
  // Chi ha chiamato giocatore corrente (ultima NOMINATE su player_id).
  let chiamatoDa: { id: number; nome: string } | null = null;
  if (s.current_nomination) {
    const n = db.prepare(
      `SELECT payload FROM auction_events WHERE session_id=? AND tipo='NOMINATE'
       AND json_extract(payload,'$.player_id')=? ORDER BY seq DESC LIMIT 1`
    ).get(sid, s.current_nomination) as { payload: string } | undefined;
    const nd = n ? (JSON.parse(n.payload) as { nominato_da?: number }).nominato_da : undefined;
    if (nd) chiamatoDa = db.prepare("SELECT id, nome FROM managers WHERE id=?").get(nd) as { id: number; nome: string } | null;
  }
  if (nomination && chiamatoDa) (nomination as { chiamatoDa?: unknown }).chiamatoDa = chiamatoDa;
  const unsold = (
    db.prepare(
      "SELECT payload FROM auction_events WHERE session_id=? AND tipo='UNSOLD' ORDER BY seq DESC LIMIT 20"
    ).all(sid) as { payload: string }[]
  ).map((r) => JSON.parse(r.payload));
  const events = (db.prepare("SELECT COUNT(*) AS n FROM auction_events WHERE session_id=?").get(sid) as { n: number }).n;
  const bought = (db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE session_id=?").get(sid) as { n: number }).n;
  return {
    session: { id: s.id, stato: s.stato, dataset: s.dataset_version, versione: s.state_version },
    managers: managerStates(db, sid),
    nomination, ultimaChiamata: ultimaChiamata(db, sid),
    prossimoChiamante: nomination ? null : turnoChiamata(db, sid),
    ruoloCorrente: ruoloCorrente(db, sid),
    unsoldUltimi: unsold, eventi: events, acquisti: bought,
  };
}

export function checkManagers(managers: ManagerInput[]) {
  if (managers.length !== 8) throw new AuctionError("MANAGERS", "Servono esattamente 8 partecipanti.");
  const nomi = managers.map((m) => m.nome.trim()).filter(Boolean);
  if (new Set(nomi).size !== 8) throw new AuctionError("MANAGERS", "Nomi duplicati o vuoti.");
}

export function updateManagers(db: DatabaseSync, sid: number, managers: ManagerInput[]): number {
  const s = getSession(db, sid);
  if (s.stato !== "PRONTA") throw new AuctionError("STATO", "Partecipanti modificabili solo prima dell'avvio.");
  checkManagers(managers);
  const ins = db.prepare("INSERT INTO managers (nome, nome_squadra, note, is_owner, crediti_iniziali) VALUES (?,?,?,?,500)");
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM managers");
    managers.forEach((m, i) => ins.run(m.nome.trim(), (m.nome_squadra || "").trim(), m.note || "", i === 0 ? 1 : 0));
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function dumpBackup(db: DatabaseSync, sid: number) {
  const s = getSession(db, sid);
  return {
    app: "Rebu AI", backup: 2, at: new Date().toISOString(),
    dataset: s.dataset_version, stato: s.stato, versione: s.state_version,
    managers: db.prepare("SELECT nome, nome_squadra, note, is_owner, crediti_iniziali FROM managers ORDER BY id").all(),
    events: db.prepare("SELECT seq, tipo, payload, idempotency_key, compensates_id FROM auction_events WHERE session_id=? ORDER BY seq").all(sid),
    settings: db.prepare("SELECT key, value FROM settings").all(),
    preferenze: db.prepare("SELECT official_id, tipo, nota FROM preferenze WHERE dataset_version=?").all(s.dataset_version),
    note: db.prepare("SELECT testo FROM strategy_notes ORDER BY id").all(),
  };
}

// Ripristino: ricrea sessione+rose dagli eventi (fonte verità). Stato PAUSA per verifica.
export function restoreBackup(db: DatabaseSync, b: Record<string, unknown>) {
  ensureExtras(db);
  if (b.app !== "Rebu AI" || (b.backup !== 1 && b.backup !== 2)) throw new AuctionError("BACKUP", "File non valido.");
  const live = db.prepare("SELECT id FROM auction_sessions WHERE stato IN ('LIVE','PAUSA')").get();
  if (live) throw new AuctionError("ASTA_APERTA", "Ripristino vietato ad asta aperta.");
  const ds = db.prepare("SELECT version FROM dataset_versions WHERE version=?").get(b.dataset as string);
  if (!ds) throw new AuctionError("DATASET", `Dataset ${b.dataset} assente: importa dati prima di ripristinare.`);
  const mans = b.managers as { nome: string; nome_squadra: string; note: string; is_owner: number | boolean; crediti_iniziali: number }[];
  checkManagers(mans.map((m) => ({ nome: m.nome, nome_squadra: m.nome_squadra, note: String(m.note ?? ""), is_owner: !!m.is_owner })));
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM agent_runs; DELETE FROM purchases; DELETE FROM auction_events; DELETE FROM auction_sessions; DELETE FROM managers;");
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('managers','auction_sessions','auction_events','purchases','agent_runs')");
    const ins = db.prepare("INSERT INTO managers (nome, nome_squadra, note, is_owner, crediti_iniziali) VALUES (?,?,?,?,?)");
    mans.forEach((m) => ins.run(m.nome, m.nome_squadra ?? "", m.note ?? "", m.is_owner ? 1 : 0, m.crediti_iniziali ?? 500));
    const sid = Number(db.prepare("INSERT INTO auction_sessions (dataset_version, stato, state_version) VALUES (?,?,?)")
      .run(b.dataset as string, "PAUSA", (b.versione as number) ?? 0).lastInsertRowid);
    const evs = b.events as { seq: number; tipo: string; payload: string; idempotency_key: string | null; compensates_id: number | null }[];
    const evId = new Map<number, number>();
    for (const e of evs) {
      const comp = e.compensates_id ? evId.get(e.compensates_id) ?? null : null;
      const r = db.prepare("INSERT INTO auction_events (session_id, seq, tipo, payload, idempotency_key, compensates_id) VALUES (?,?,?,?,?,?)")
        .run(sid, e.seq, e.tipo, e.payload, e.idempotency_key, comp);
      evId.set(e.seq, Number(r.lastInsertRowid));
    }
    // rose ricostruite dai SELL non compensati
    const compd = new Set(evs.filter((e) => e.tipo === "COMPENSATE").map((e) => JSON.parse(e.payload).dettaglio?.official_id));
    void compd;
    const compensatedSeq = new Set<number>();
    const bySeq = new Map(evs.map((e) => [e.seq, e]));
    for (const e of evs) {
      if (e.tipo !== "COMPENSATE") continue;
      const target = (bySeq.get(e.compensates_id ?? -1));
      if (target) compensatedSeq.add(target.seq);
    }
    const insP = db.prepare("INSERT INTO purchases (session_id, player_id, manager_id, prezzo, source_event_id) VALUES (?,?,?,?,?)");
    for (const e of evs) {
      if (e.tipo !== "SELL" || compensatedSeq.has(e.seq)) continue;
      const p = JSON.parse(e.payload);
      const prow = db.prepare("SELECT id FROM players WHERE dataset_version=? AND official_id=?").get(b.dataset as string, p.official_id) as { id: number } | undefined;
      if (!prow) throw new AuctionError("DATASET", `Giocatore ${p.official_id} assente in dataset ${b.dataset}: importa dati giusti.`);
      insP.run(sid, prow.id, p.manager_id, p.prezzo, evId.get(e.seq) ?? null);
    }
    // Extra backup v2: preferenze, note, settings (chiavi lega note).
    if (b.backup === 2) {
      db.prepare("DELETE FROM preferenze WHERE dataset_version=?").run(b.dataset as string);
      const insPr = db.prepare("INSERT INTO preferenze (dataset_version, official_id, tipo, nota) VALUES (?,?,?,?)");
      for (const pr of (b.preferenze ?? []) as { official_id: number; tipo: string; nota: string }[]) {
        insPr.run(b.dataset as string, pr.official_id, pr.tipo, pr.nota ?? "");
      }
      db.exec("DELETE FROM strategy_notes");
      const insN = db.prepare("INSERT INTO strategy_notes (testo) VALUES (?)");
      for (const n of (b.note ?? []) as { testo: string }[]) insN.run(n.testo);
      const setK = db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      for (const s of (b.settings ?? []) as { key: string; value: string }[]) {
        if (["crediti","rosa_P","rosa_D","rosa_C","rosa_A","modo","modificatore_default","ordine_reparti","modello_default","dataset_attivo"].includes(s.key)) {
          setK.run(s.key, s.value);
        }
      }
    }
    db.exec("COMMIT");
    return sid;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function resetAuction(db: DatabaseSync) {
  ensureExtras(db);
  const live = db.prepare("SELECT id FROM auction_sessions WHERE stato='LIVE'").get();
  if (live) throw new AuctionError("ASTA_LIVE", "Asta live: metti in pausa o concludi prima del reset.");
  db.exec("DELETE FROM agent_runs; DELETE FROM purchases; DELETE FROM auction_events; DELETE FROM auction_sessions;");
  db.exec("DELETE FROM sqlite_sequence WHERE name IN ('auction_sessions','auction_events','purchases','agent_runs')");
}

// --- Setup: rasa manager, semina 8 da avversari.csv, nuova sessione PRONTA ---
export function setupLeague(db: DatabaseSync, managers: ManagerInput[]): number {
  if (managers.length !== 8) throw new AuctionError("MANAGERS", "Servono esattamente 8 partecipanti.");
  const nomi = managers.map((m) => m.nome.trim()).filter(Boolean);
  if (new Set(nomi).size !== 8) throw new AuctionError("MANAGERS", "Nomi duplicati o vuoti.");
  ensureExtras(db);
  const open = db.prepare("SELECT id FROM auction_sessions WHERE stato IN ('BOZZA','PRONTA','LIVE','PAUSA')").get();
  if (open) throw new AuctionError("ASTA_APERTA", "Esiste già asta non conclusa. Concludila prima.");
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM agent_runs; DELETE FROM purchases; DELETE FROM auction_events; DELETE FROM auction_sessions; DELETE FROM managers;");
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('managers','auction_sessions','auction_events','purchases','agent_runs')");
    const ins = db.prepare("INSERT INTO managers (nome, nome_squadra, note, is_owner, crediti_iniziali) VALUES (?,?,?,?,500)");
    managers.forEach((m, i) =>
      ins.run(m.nome.trim(), (m.nome_squadra || "").trim(), m.note || "", i === 0 ? 1 : 0)
    );
    db.prepare("INSERT OR IGNORE INTO dataset_versions (version, source_hash) VALUES ('UNFROZEN','-')").run();
    const r = db.prepare("INSERT INTO auction_sessions (dataset_version, stato) VALUES ((SELECT COALESCE((SELECT value FROM settings WHERE key='dataset_attivo'), 'UNFROZEN')), 'PRONTA')").run();
    db.exec("COMMIT");
    return Number(r.lastInsertRowid);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function startAuction(db: DatabaseSync, sid: number, expected?: number): number {
  ensureExtras(db);
  const s = getSession(db, sid);
  if (s.stato !== "PRONTA") throw new AuctionError("STATO", `Avvio solo da PRONTA (ora ${s.stato}).`);
  checkVersion(s, expected);
  const ds = db.prepare("SELECT value FROM settings WHERE key='dataset_attivo'").get() as { value: string } | undefined;
  if (!ds?.value) throw new AuctionError("DATASET", "Dataset non importato. Esegui npm run import.");
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE auction_sessions SET dataset_version=?, stato='LIVE' WHERE id=?").run(ds.value, sid);
    pushEvent(db, sid, "START", { dataset: ds.value });
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return v;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Turno di nomina: a giro tra manager in ordine di id. Ogni NOMINATE non
// compensata fa avanzare giro, esito vendita/invenduto irrilevante.
export function turnoChiamata(db: DatabaseSync, sid: number): { indice: number; managerId: number; nome: string } {
  const mans = db.prepare("SELECT id, nome FROM managers ORDER BY id").all() as { id: number; nome: string }[];
  if (!mans.length) throw new AuctionError("MANAGER", "Squadre assenti.");
  const n = (db.prepare(
    `SELECT COUNT(*) AS n FROM auction_events e WHERE session_id=? AND tipo='NOMINATE'
     AND NOT EXISTS (SELECT 1 FROM auction_events c WHERE c.session_id=? AND c.tipo='COMPENSATE' AND c.compensates_id=e.id)`
  ).get(sid, sid) as { n: number }).n;
  const m = mans[n % mans.length];
  return { indice: n % mans.length, managerId: m.id, nome: m.nome };
}

// Ultima chiamata (rialzo) su nomina corrente: ultimo BID non compensato
// DOPO ultima NOMINATE dello stesso giocatore (rinomina riparte da zero).
export function ultimaChiamata(db: DatabaseSync, sid: number): { prezzo: number } | null {
  const s = getSession(db, sid);
  if (!s.current_nomination) return null;
  const nom = db.prepare(
    `SELECT seq FROM auction_events WHERE session_id=? AND tipo='NOMINATE'
     AND json_extract(payload,'$.player_id')=? ORDER BY seq DESC LIMIT 1`
  ).get(sid, s.current_nomination) as { seq: number } | undefined;
  const dalSeq = nom?.seq ?? 0;
  const r = db.prepare(
    `SELECT payload FROM auction_events e WHERE session_id=? AND tipo='BID' AND seq>?
     AND json_extract(payload,'$.player_id')=?
     AND NOT EXISTS (SELECT 1 FROM auction_events c WHERE c.session_id=? AND c.tipo='COMPENSATE' AND c.compensates_id=e.id)
     ORDER BY seq DESC LIMIT 1`
  ).get(sid, dalSeq, s.current_nomination, sid) as { payload: string } | undefined;
  return r ? { prezzo: (JSON.parse(r.payload) as { prezzo: number }).prezzo } : null;
}

export function nominate(db: DatabaseSync, sid: number, officialId: number, expected?: number, nominatoDa?: number) {
  const s = getSession(db, sid);
  if (s.stato !== "LIVE") throw new AuctionError("STATO", "Nomine solo a asta LIVE.");
  checkVersion(s, expected);
  const p = playerInDataset(db, s.dataset_version, officialId);
  if (soldTo(db, sid, p.id)) throw new AuctionError("GIA_ASSEGNATO", `${p.nome} già assegnato.`);
  // Chi nomina: passato da UI oppure automatico a giro.
  let chiamante = nominatoDa;
  if (!chiamante) chiamante = turnoChiamata(db, sid).managerId;
  const chim = db.prepare("SELECT id, nome FROM managers WHERE id=?").get(chiamante) as { id: number; nome: string } | undefined;
  if (!chim) throw new AuctionError("MANAGER", "Chiamante assente.");
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE auction_sessions SET current_nomination=? WHERE id=?").run(p.id, sid);
    pushEvent(db, sid, "NOMINATE", { official_id: officialId, nome: p.nome, player_id: p.id, nominato_da: chim.id });
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return { versione: v, giocatore: p, chiamatoDa: chim };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Rialzo in ordine sparso: chiunque offre, ultima chiamata vince finché superata.
// Stessa cifra re-inviata (doppio tap) = duplicato innocuo, non errore.
export function bid(db: DatabaseSync, sid: number, args: { officialId: number; prezzo: number; expected?: number }) {
  const s = getSession(db, sid);
  if (s.stato !== "LIVE") throw new AuctionError("STATO", "Rialzi solo a asta LIVE.");
  checkVersion(s, args.expected);
  if (!Number.isInteger(args.prezzo) || args.prezzo < 1) throw new AuctionError("PREZZO", "Offerta intera >= 1.");
  const p = playerInDataset(db, s.dataset_version, args.officialId);
  if (s.current_nomination !== p.id) throw new AuctionError("NOMINA", "Rialzo solo su giocatore chiamato.");
  const last = ultimaChiamata(db, sid);
  if (last && args.prezzo === last.prezzo) return { duplicato: true as const, versione: s.state_version, prezzo: last.prezzo };
  if (last && args.prezzo < last.prezzo) {
    throw new AuctionError("RIALZO", `Ultima chiamata ${last.prezzo}: offri almeno ${last.prezzo}.`);
  }
  db.exec("BEGIN");
  try {
    pushEvent(db, sid, "BID", { official_id: args.officialId, player_id: p.id, prezzo: args.prezzo });
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return { duplicato: false as const, versione: v, prezzo: args.prezzo };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function sell(
  db: DatabaseSync, sid: number,
  args: { officialId: number; managerId: number; prezzo: number; idem: string; expected?: number }
) {
  const s = getSession(db, sid);
  if (s.stato !== "LIVE") throw new AuctionError("STATO", "Vendite solo a asta LIVE.");
  checkVersion(s, args.expected);
  if (!args.idem) throw new AuctionError("IDEMPOTENZA", "Chiave idempotenza obbligatoria.");
  if (!Number.isInteger(args.prezzo) || args.prezzo < 1) throw new AuctionError("PREZZO", "Prezzo intero >= 1.");
  // STOP assegna a ultima chiamata: se ci sono rialzi, prezzo deve coincidere.
  const last = ultimaChiamata(db, sid);
  if (last && args.prezzo !== last.prezzo) {
    throw new AuctionError("PREZZO", `STOP assegna a ultima chiamata (${last.prezzo}), non ${args.prezzo}.`);
  }
  // Doppio click: stessa chiave = ritorno esito esistente, nessun duplicato
  const dup = db.prepare("SELECT payload FROM auction_events WHERE idempotency_key=?").get(args.idem) as
    | { payload: string }
    | undefined;
  if (dup) return { duplicato: true as const, ...JSON.parse(dup.payload) };

  const p = playerInDataset(db, s.dataset_version, args.officialId);
  if (s.current_nomination && s.current_nomination !== p.id) {
    throw new AuctionError("NOMINA", "Chiudi prima nomina corrente (vendi o invenduto).");
  }
  if (soldTo(db, sid, p.id)) throw new AuctionError("GIA_ASSEGNATO", `${p.nome} già assegnato.`);
  const ms = managerStates(db, sid);
  const m = ms.find((x) => x.id === args.managerId);
  if (!m) throw new AuctionError("MANAGER", "Squadra acquirente assente.");
  const slot = m.slot[p.ruolo_classic];
  if (!slot) throw new AuctionError("RUOLO", `Ruolo ${p.ruolo_classic} fuori rosa.`);
  if (slot.usati >= slot.totali) throw new AuctionError("SLOT_ESAURITO", `${m.nome}: slot ${p.ruolo_classic} pieni.`);
  const vuotiPrima = Object.values(m.slot).reduce((a, x) => a + (x.totali - x.usati), 0);
  if (args.prezzo > m.residui - (vuotiPrima - 1)) {
    throw new AuctionError(
      "CREDITI_INSUFFICIENTI",
      `${m.nome}: max ${m.residui - (vuotiPrima - 1)} per lasciare 1 credito a slot vuoti.`
    );
  }
  db.exec("BEGIN");
  try {
    const ev = pushEvent(db, sid, "SELL",
      { official_id: args.officialId, nome: p.nome, manager_id: m.id, prezzo: args.prezzo }, args.idem);
    db.prepare("INSERT INTO purchases (session_id, player_id, manager_id, prezzo, source_event_id) VALUES (?,?,?,?,?)")
      .run(sid, p.id, m.id, args.prezzo, ev);
    db.prepare("UPDATE auction_sessions SET current_nomination=NULL WHERE id=?").run(sid);
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return { duplicato: false as const, versione: v };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function markUnsold(db: DatabaseSync, sid: number, officialId: number, expected?: number) {
  const s = getSession(db, sid);
  if (s.stato !== "LIVE") throw new AuctionError("STATO", "Solo a asta LIVE.");
  checkVersion(s, expected);
  const p = playerInDataset(db, s.dataset_version, officialId);
  if (soldTo(db, sid, p.id)) throw new AuctionError("GIA_ASSEGNATO", `${p.nome} già assegnato.`);
  db.exec("BEGIN");
  try {
    pushEvent(db, sid, "UNSOLD", { official_id: officialId, nome: p.nome });
    db.prepare("UPDATE auction_sessions SET current_nomination=NULL WHERE id=?").run(sid);
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return { versione: v };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Undo LIFO: solo ultima operazione NOMINATE/SELL/UNSOLD -> evento compensativo
export function undoLast(db: DatabaseSync, sid: number, expected?: number) {
  const s = getSession(db, sid);
  if (s.stato !== "LIVE" && s.stato !== "PAUSA") throw new AuctionError("STATO", "Undo solo in LIVE/PAUSA.");
  checkVersion(s, expected);
  const last = db.prepare(
    `SELECT * FROM auction_events e WHERE session_id=? AND tipo IN ('NOMINATE','SELL','UNSOLD','BID')
     AND NOT EXISTS (SELECT 1 FROM auction_events c WHERE c.session_id=? AND c.tipo='COMPENSATE' AND c.compensates_id=e.id)
     ORDER BY seq DESC LIMIT 1`
  ).get(sid, sid) as { id: number; tipo: string; payload: string } | undefined;
  if (!last) {
    throw new AuctionError("NON_ANNULLABILE", "Niente da annullare (nessuna operazione attiva).");
  }
  const pl = JSON.parse(last.payload);
  db.exec("BEGIN");
  try {
    if (last.tipo === "SELL") {
      const prow = db.prepare("SELECT id FROM players WHERE dataset_version=? AND official_id=?").get(
        s.dataset_version, pl.official_id) as { id: number };
      db.prepare("DELETE FROM purchases WHERE session_id=? AND player_id=?").run(sid, prow.id);
    }
    if (last.tipo === "NOMINATE") {
      const cur = getSession(db, sid).current_nomination;
      if (cur === (pl.player_id ?? cur)) {
        db.prepare("UPDATE auction_sessions SET current_nomination=NULL WHERE id=?").run(sid);
      }
    }
    pushEvent(db, sid, "COMPENSATE", { annulla: last.tipo, dettaglio: pl }, null, last.id);
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return { versione: v, annullato: last.tipo };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function control(db: DatabaseSync, sid: number, action: "pause" | "resume" | "complete", expected?: number) {
  const s = getSession(db, sid);
  checkVersion(s, expected);
  const next =
    action === "pause" && s.stato === "LIVE" ? "PAUSA"
    : action === "resume" && s.stato === "PAUSA" ? "LIVE"
    : action === "complete" && (s.stato === "LIVE" || s.stato === "PAUSA") ? "CONCLUSA"
    : null;
  if (!next) throw new AuctionError("STATO", `Azione ${action} vietata in stato ${s.stato}.`);
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE auction_sessions SET stato=? WHERE id=?").run(next, sid);
    pushEvent(db, sid, action.toUpperCase(), { da: s.stato, a: next });
    const v = bump(db, { ...s });
    db.exec("COMMIT");
    return { versione: v, stato: next };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Ricostruisce stato dagli eventi e confronta con tabelle: prova event sourcing
export function rebuildCheck(db: DatabaseSync, sid: number) {
  getSession(db, sid);
  const evs = db.prepare("SELECT tipo, payload FROM auction_events WHERE session_id=? ORDER BY seq").all(sid) as {
    tipo: string; payload: string;
  }[];
  const sold = new Map<number, { manager_id: number; prezzo: number }>();
  for (const e of evs) {
    const p = JSON.parse(e.payload);
    if (e.tipo === "SELL") sold.set(p.official_id, { manager_id: p.manager_id, prezzo: p.prezzo });
    if (e.tipo === "COMPENSATE" && p.annulla === "SELL") sold.delete(p.dettaglio.official_id);
  }
  const rows = db.prepare(
    `SELECT pl.official_id AS o, pu.manager_id AS m, pu.prezzo AS pr
     FROM purchases pu JOIN players pl ON pl.id=pu.player_id WHERE pu.session_id=?`
  ).all(sid) as { o: number; m: number; pr: number }[];
  const diffs: string[] = [];
  if (rows.length !== sold.size) diffs.push(`acquisti tabella=${rows.length} vs eventi=${sold.size}`);
  for (const r of rows) {
    const e = sold.get(r.o);
    if (!e || e.manager_id !== r.m || e.prezzo !== r.pr) diffs.push(`diverge id ${r.o}`);
  }
  return { ok: diffs.length === 0, diffs, eventi: evs.length };
}
