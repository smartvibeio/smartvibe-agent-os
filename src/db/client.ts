import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export type AppDatabase = DatabaseSync;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = path.resolve(
  process.cwd(),
  "data",
  "smartvibe.phase1.db",
);

export function ensureDataDir(dbPath: string = DEFAULT_DB_PATH): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export function openDb(dbPath: string = DEFAULT_DB_PATH): AppDatabase {
  ensureDataDir(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function migrate(db: AppDatabase): void {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  db.exec(sql);
}

export function resetDb(dbPath: string = DEFAULT_DB_PATH): AppDatabase {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  const db = openDb(dbPath);
  migrate(db);
  return db;
}
