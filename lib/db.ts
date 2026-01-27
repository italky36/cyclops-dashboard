import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

let db: Database.Database | null = null;

function getDbPath(): string {
  return process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'cyclops.db');
}

function ensureSchema(database: Database.Database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      success INTEGER NOT NULL,
      attempted_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_user_time
      ON login_attempts (username, attempted_at);
  `);
}

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  ensureSchema(db);
  return db;
}
