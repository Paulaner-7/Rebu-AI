// Rebu AI — importa la knowledge base strategica (dati/fantacalcio_kb.md) in strategy_notes.
// Uso: node scripts/import-kb.mjs
// Idempotente: hash file in settings.kb_hash; se invariato non tocca nulla.
// Una riga per blocco [KB-ID]: il modello può poi leggerli via tool consultaStrategia
// (che cerca sia nel file sia, se preferisci, nella tabella — vedi src/lib/knowledge.ts).
import { createHash } from "node:crypto";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = join(ROOT, ".data", "rebu.db");
const KB = join(ROOT, "..", "dati", "fantacalcio_kb.md");
if (!existsSync(KB)) {
  console.error(`KB non trovata: ${KB}\nCopia fantacalcio_kb.md nella cartella dati/ (accanto a listone.xlsx).`);
  process.exit(2);
}
const md = readFileSync(KB, "utf8");
const hash = createHash("sha256").update(md).digest("hex").slice(0, 16);

// Parser speculare a src/lib/knowledge.ts (sezioni ##, tag `#x`, blocchi **[KB-XX-nn]**).
function parseKb(text) {
  const blocks = [];
  let sezione = "", tagSezione = [], cur = null;
  const flush = () => { if (cur && (cur.testo.trim() || cur.titolo)) blocks.push(cur); cur = null; };
  for (const line of text.split("\n")) {
    const hSec = line.match(/^##\s+(.+)$/);
    if (hSec) { flush(); sezione = hSec[1].trim(); tagSezione = []; continue; }
    if (/^((?:`#[\w-]+`\s*)+)$/.test(line) && !cur) {
      tagSezione = [...line.matchAll(/`#([\w-]+)`/g)].map((m) => m[1]); continue;
    }
    const hBlock = line.match(/^\*\*\[(KB-[A-Z]+-\d+)\]\s*([^*]*)\*\*\s*(.*)$/);
    if (hBlock) {
      flush();
      cur = { id: hBlock[1], sezione, titolo: hBlock[2].trim(), testo: hBlock[3] ?? "", tag: [...tagSezione] };
      continue;
    }
    if (line.startsWith("---") || line.startsWith("# ")) { flush(); continue; }
    if (cur) cur.testo += (cur.testo ? "\n" : "") + line;
  }
  flush();
  return blocks;
}

mkdirSync(join(ROOT, ".data"), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(readFileSync(join(ROOT, "src", "lib", "schema.sqlite.sql"), "utf8"));

const cur = db.prepare("SELECT value FROM settings WHERE key='kb_hash'").get();
if (cur?.value === hash) {
  console.log(`IDEMPOTENTE: KB hash ${hash} già importata. Niente duplicati.`);
  process.exit(0);
}
const blocks = parseKb(md);
db.exec("BEGIN");
try {
  db.prepare("DELETE FROM strategy_notes WHERE testo LIKE '[KB-%'").run();
  const ins = db.prepare("INSERT INTO strategy_notes (testo) VALUES (?)");
  for (const b of blocks) {
    ins.run(`[${b.id}] (${b.sezione}) ${b.titolo ? b.titolo + " — " : ""}${b.testo.trim()}\ntag: ${b.tag.map((t) => "#" + t).join(" ")}`);
  }
  db.prepare("INSERT INTO settings (key, value) VALUES ('kb_hash', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(hash);
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
console.log(`KB IMPORTATA: ${blocks.length} blocchi, hash ${hash}.`);
