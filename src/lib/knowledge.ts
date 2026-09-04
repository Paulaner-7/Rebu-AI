// Rebu AI — loader della knowledge base strategica (dati/fantacalcio_kb.md).
// La KB è un Markdown con blocchi "**[KB-XX-nn] Titolo.** corpo..." organizzati
// in sezioni "## n. Titolo" con riga tag ` `#a` `#b` ` `.
// Uso:
//   import { kbCerca, kbBlocco, kbDigest, seedKb } from "./knowledge";
//   seedKb(db)                         -> copia i blocchi in strategy_notes (idempotente)
//   kbDigest(900)                      -> digest compatto da iniettare nel system prompt
//   kbCerca("esche rilancio", 3)       -> blocchi pertinenti (tool consultaStrategia)
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DatabaseSync } from "node:sqlite";

export type KbBlock = {
  id: string;          // "KB-ECO-01"
  sezione: string;     // "1. Economia dell'asta e gestione del budget"
  titolo: string;      // testo nel bold dopo l'ID (può essere "")
  testo: string;       // corpo del blocco, markdown leggero
  tag: string[];       // tag di sezione + tag inline
};

// dati/ è sibling della repo (come in scripts/import-dataset.mjs: ROOT/../dati).
const KB_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "dati", "fantacalcio_kb.md");

let cache: { hash: string; blocks: KbBlock[]; byId: Map<string, KbBlock> } | null = null;

function parseKb(md: string): KbBlock[] {
  const blocks: KbBlock[] = [];
  let sezione = "";
  let tagSezione: string[] = [];
  const lines = md.split("\n");
  let cur: KbBlock | null = null;
  const flush = () => {
    if (cur) {
      cur.testo = cur.testo.trim();
      if (cur.testo || cur.titolo) blocks.push(cur);
      cur = null;
    }
  };
  for (const line of lines) {
    const hSec = line.match(/^##\s+(.+)$/);
    if (hSec) { flush(); sezione = hSec[1].trim(); tagSezione = []; continue; }
    const hTags = line.match(/^((?:`#[\w-]+`\s*)+)$/);
    if (hTags && !cur) { tagSezione = [...line.matchAll(/`#([\w-]+)`/g)].map((m) => m[1]); continue; }
    const hBlock = line.match(/^\*\*\[(KB-[A-Z]+-\d+)\]\s*([^*]*)\*\*\s*(.*)$/);
    if (hBlock) {
      flush();
      cur = { id: hBlock[1], sezione, titolo: hBlock[2].trim(), testo: hBlock[3] ?? "", tag: [...tagSezione] };
      continue;
    }
    if (line.startsWith("---") || line.startsWith("# ")) { flush(); continue; }
    if (cur) {
      cur.testo += (cur.testo ? "\n" : "") + line;
      for (const m of line.matchAll(/`#([\w-]+)`/g)) if (!cur.tag.includes(m[1])) cur.tag.push(m[1]);
    }
  }
  flush();
  return blocks;
}

export function loadKb(path = KB_PATH) {
  if (!existsSync(path)) return { hash: "", blocks: [] as KbBlock[], byId: new Map<string, KbBlock>() };
  const md = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(md).digest("hex").slice(0, 16);
  if (cache && cache.hash === hash) return cache;
  const blocks = parseKb(md);
  cache = { hash, blocks, byId: new Map(blocks.map((b) => [b.id, b])) };
  return cache;
}

export function kbBlocco(id: string): KbBlock | null {
  return loadKb().byId.get(id.toUpperCase()) ?? null;
}

// Ricerca per parole chiave: +3 tag, +2 titolo, +1 corpo. ID esatto = match pieno.
export function kbCerca(q: string, max = 3): { risultati: { id: string; titolo: string; testo: string; tag: string[] }[]; totale: number } {
  const { blocks, byId } = loadKb();
  const query = q.trim();
  if (!query) return { risultati: [], totale: 0 };
  const diretto = byId.get(query.toUpperCase());
  if (diretto) return { risultati: [{ id: diretto.id, titolo: diretto.titolo, testo: diretto.testo, tag: diretto.tag }], totale: 1 };
  const words = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];
  const scored = blocks
    .map((b) => {
      let s = 0;
      const hayT = b.titolo.toLowerCase();
      const hayB = b.testo.toLowerCase();
      for (const w of words) {
        if (b.tag.some((t) => t.toLowerCase().includes(w))) s += 3;
        if (hayT.includes(w)) s += 2;
        if (hayB.includes(w)) s += 1;
      }
      return { b, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, z) => z.s - a.s)
    .slice(0, Math.min(Math.max(max, 1), 10));
  return {
    risultati: scored.map(({ b }) => ({ id: b.id, titolo: b.titolo, testo: b.testo.slice(0, 900), tag: b.tag })),
    totale: scored.length,
  };
}

// Digest compatto per il system prompt: 1 riga per blocco, entro maxChars.
export function kbDigest(maxChars = 900): string {
  const { blocks } = loadKb();
  if (!blocks.length) return "";
  const righe: string[] = ["\nPrincipi strategici KB (dettagli con tool consultaStrategia; cita gli ID in fonti):"];
  let usati = righe[0].length;
  for (const b of blocks) {
    const prima = (b.titolo || b.testo).replace(/\s+/g, " ").trim();
    const riga = `- ${b.id}: ${prima.slice(0, 90)}`;
    if (usati + riga.length + 1 > maxChars) break;
    righe.push(riga);
    usati += riga.length + 1;
  }
  return righe.join("\n");
}

// Copia idempotente dei blocchi in strategy_notes (colonna testo, prefisso [KB-ID]).
export function seedKb(db: DatabaseSync, path = KB_PATH): { inseriti: number; hash: string; saltato: boolean } {
  const { hash, blocks } = loadKb(path);
  if (!blocks.length) return { inseriti: 0, hash: "", saltato: true };
  const cur = db.prepare("SELECT value FROM settings WHERE key='kb_hash'").get() as { value: string } | undefined;
  if (cur?.value === hash) return { inseriti: 0, hash, saltato: true };
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM strategy_notes WHERE testo LIKE '[KB-%'").run();
    const ins = db.prepare("INSERT INTO strategy_notes (testo) VALUES (?)");
    for (const b of blocks) {
      ins.run(`[${b.id}] (${b.sezione}) ${b.titolo ? b.titolo + " — " : ""}${b.testo}\ntag: ${b.tag.map((t) => "#" + t).join(" ")}`);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES ('kb_hash', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash);
    db.exec("COMMIT");
    return { inseriti: blocks.length, hash, saltato: false };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
