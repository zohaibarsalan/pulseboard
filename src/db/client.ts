import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export function openDb(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return drizzle(sqlite, { schema, casing: "snake_case" }) as Db;
}

export function closeDb(db: Db): void {
  db.$client.close();
}
