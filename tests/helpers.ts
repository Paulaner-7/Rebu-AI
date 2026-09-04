import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeDb, type Db } from "../src/lib/pgdb";

export async function memDb(): Promise<Db> {
  const db = makeDb(new DatabaseSync(":memory:"));
  await db.exec(readFileSync(join(process.cwd(), "src", "lib", "schema.sqlite.sql"), "utf8"));
  return db;
}
