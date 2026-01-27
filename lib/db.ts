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

    -- ============ VENDISTA: ТОРГОВЫЕ АВТОМАТЫ ============

    CREATE TABLE IF NOT EXISTS vending_machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendista_id TEXT NOT NULL UNIQUE,
      name TEXT,
      model TEXT,
      address TEXT,
      serial_number TEXT,
      terminal_id TEXT,
      is_active INTEGER DEFAULT 1,
      synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vending_machines_vendista_id
      ON vending_machines (vendista_id);

    -- ============ ПРИВЯЗКА АВТОМАТОВ К БЕНЕФИЦИАРАМ ============

    CREATE TABLE IF NOT EXISTS machine_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id INTEGER NOT NULL REFERENCES vending_machines(id) ON DELETE RESTRICT,
      beneficiary_id TEXT NOT NULL,
      commission_percent REAL NOT NULL DEFAULT 10.0,
      assigned_at TEXT NOT NULL,
      unassigned_at TEXT,
      created_by TEXT,
      UNIQUE(machine_id, beneficiary_id, assigned_at)
    );

    CREATE INDEX IF NOT EXISTS idx_machine_assignments_beneficiary
      ON machine_assignments (beneficiary_id);

    CREATE INDEX IF NOT EXISTS idx_machine_assignments_machine
      ON machine_assignments (machine_id);

    CREATE INDEX IF NOT EXISTS idx_machine_assignments_active
      ON machine_assignments (machine_id, unassigned_at);

    -- ============ ИСТОРИЯ ВЫПЛАТ БЕНЕФИЦИАРАМ ============

    CREATE TABLE IF NOT EXISTS beneficiary_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      beneficiary_id TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      total_sales REAL NOT NULL,
      commission_amount REAL NOT NULL,
      payout_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cyclops_deal_id TEXT,
      cyclops_response TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      executed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_beneficiary_payouts_beneficiary
      ON beneficiary_payouts (beneficiary_id);

    CREATE INDEX IF NOT EXISTS idx_beneficiary_payouts_period
      ON beneficiary_payouts (period_start, period_end);

    CREATE INDEX IF NOT EXISTS idx_beneficiary_payouts_status
      ON beneficiary_payouts (status);

    -- ============ ДЕТАЛИ ВЫПЛАТЫ ПО АВТОМАТАМ ============

    CREATE TABLE IF NOT EXISTS payout_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payout_id INTEGER NOT NULL REFERENCES beneficiary_payouts(id) ON DELETE CASCADE,
      machine_id INTEGER NOT NULL REFERENCES vending_machines(id) ON DELETE RESTRICT,
      sales_amount REAL NOT NULL,
      commission_percent REAL NOT NULL,
      commission_amount REAL NOT NULL,
      net_amount REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payout_details_payout
      ON payout_details (payout_id);

    -- ============ НАСТРОЙКИ АВТОМАТИЧЕСКИХ ВЫПЛАТ ============

    CREATE TABLE IF NOT EXISTS payout_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cron_expression TEXT NOT NULL DEFAULT '0 0 1 * *',
      is_enabled INTEGER NOT NULL DEFAULT 0,
      last_run_at TEXT,
      next_run_at TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );

    -- ============ ЛОГ ДЕЙСТВИЙ ============

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_entity
      ON audit_log (entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_audit_log_action
      ON audit_log (action);
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
