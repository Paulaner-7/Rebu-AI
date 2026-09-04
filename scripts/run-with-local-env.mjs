// Wrapper: carica chiavi da .env.local (stessa cartella di questo repo)
// e lancia un altro script con env popolato. Non stampa mai valori.
// Uso: node scripts/run-with-local-env.mjs scripts/migrate-supabase.mjs [--dry]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("Uso: run-with-local-env.mjs <script> [args...]");
  process.exit(2);
}
try {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  console.error("File chiavi locale assente, uso env esistente.");
}
const r = spawnSync("node", [join(ROOT, target), ...process.argv.slice(3)], { stdio: "inherit" });
process.exit(r.status ?? 1);
