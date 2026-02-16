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

    CREATE TABLE IF NOT EXISTS beneficiaries_cache (
      beneficiary_id TEXT PRIMARY KEY,
      inn TEXT,
      legal_type TEXT,
      is_active INTEGER,
      nominal_account_code TEXT,
      nominal_account_bic TEXT,
      name TEXT,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      kpp TEXT,
      ogrn TEXT,
      ogrnip TEXT,
      birth_date TEXT,
      is_added_to_ms INTEGER,
      created_at TEXT,
      updated_at TEXT,
      last_sync_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_beneficiaries_cache_inn
      ON beneficiaries_cache (inn);

    CREATE TABLE IF NOT EXISTS beneficiary_status_checks (
      beneficiary_id TEXT PRIMARY KEY,
      last_checked_at INTEGER NOT NULL
    );

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

    -- ============ КЛИЕНТЫ ============

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact_name TEXT,
      phone TEXT,
      email TEXT,

      -- Тип выплаты: payment_contract | payment_contract_by_sbp_v2 | payment_contract_to_card
      payout_type TEXT NOT NULL DEFAULT 'payment_contract',

      -- Реквизиты для payment_contract (банковский перевод)
      bank_account TEXT,
      bank_code TEXT,
      bank_name TEXT,
      inn TEXT,
      kpp TEXT,
      recipient_name TEXT,
      payout_purpose TEXT,

      -- Реквизиты для СБП
      sbp_phone TEXT,
      sbp_bank_id TEXT,
      sbp_first_name TEXT,
      sbp_middle_name TEXT,
      sbp_last_name TEXT,

      -- Реквизиты для карты
      card_number_encrypted TEXT,
      card_first_name TEXT,
      card_middle_name TEXT,
      card_last_name TEXT,

      -- Связь с Cyclops бенефициаром (опционально)
      beneficiary_id TEXT,

      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);
    CREATE INDEX IF NOT EXISTS idx_clients_inn ON clients (inn);
    CREATE INDEX IF NOT EXISTS idx_clients_beneficiary ON clients (beneficiary_id);
    CREATE INDEX IF NOT EXISTS idx_clients_active ON clients (is_active);

    -- ============ НАСТРОЙКИ ПЛАТФОРМЫ ============

    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payout_virtual_account TEXT,
      payout_purpose_template TEXT DEFAULT 'Выплата по договору за период {period}',
      updated_at TEXT NOT NULL
    );

    -- ============ TENDER-HELPERS (PRE ONLY) ============

    CREATE TABLE IF NOT EXISTS tender_helpers_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      recipient_account TEXT NOT NULL,
      recipient_bank_code TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tender_helpers_payers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payer_bank_code TEXT NOT NULL,
      payer_account TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_helpers_payers_default
      ON tender_helpers_payers (is_default)
      WHERE is_default = 1;

    CREATE TABLE IF NOT EXISTS tender_helpers_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_pay_key TEXT,
      status TEXT,
      amount REAL,
      purpose TEXT,
      recipient_account TEXT,
      recipient_bank_code TEXT,
      payer_account TEXT,
      payer_bank_code TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tender_helpers_payments_created_at
      ON tender_helpers_payments (created_at DESC);

    -- ============ PAYMENTS CACHE ============

    CREATE TABLE IF NOT EXISTS payments_cache (
      layer TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      incoming INTEGER,
      payer_account TEXT,
      payer_bank_code TEXT,
      recipient_account TEXT,
      recipient_bank_code TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (layer, payment_id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_cache_layer_last_seen
      ON payments_cache (layer, last_seen_at DESC);

    -- ============ ANALYTICS DAILY ============

    CREATE TABLE IF NOT EXISTS analytics_daily (
      layer TEXT NOT NULL,
      date TEXT NOT NULL,
      payments_sum REAL NOT NULL DEFAULT 0,
      deals_sum REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (layer, date)
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_daily_layer_date
      ON analytics_daily (layer, date DESC);

    CREATE INDEX IF NOT EXISTS idx_analytics_daily_updated
      ON analytics_daily (updated_at DESC);
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
  runMigrations(db);
  return db;
}

/**
 * Миграции: добавление столбцов к существующим таблицам
 */
function runMigrations(database: Database.Database) {
  // Добавляем client_id к machine_assignments (если ещё нет)
  const maColumns = database.pragma('table_info(machine_assignments)') as Array<{ name: string }>;
  if (!maColumns.some(c => c.name === 'client_id')) {
    database.exec(`ALTER TABLE machine_assignments ADD COLUMN client_id INTEGER REFERENCES clients(id)`);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_machine_assignments_client ON machine_assignments (client_id)`);
  }

  // Добавляем client_id к beneficiary_payouts (если ещё нет)
  const bpColumns = database.pragma('table_info(beneficiary_payouts)') as Array<{ name: string }>;
  if (!bpColumns.some(c => c.name === 'client_id')) {
    database.exec(`ALTER TABLE beneficiary_payouts ADD COLUMN client_id INTEGER REFERENCES clients(id)`);
    database.exec(`CREATE INDEX IF NOT EXISTS idx_beneficiary_payouts_client ON beneficiary_payouts (client_id)`);
  }

  // Добавляем is_auto к beneficiary_payouts
  if (!bpColumns.some(c => c.name === 'is_auto')) {
    database.exec(`ALTER TABLE beneficiary_payouts ADD COLUMN is_auto INTEGER DEFAULT 0`);
  }

  // Добавляем поля автовыплат к clients
  const clientColumns = database.pragma('table_info(clients)') as Array<{ name: string }>;
  const clientColumnNames = clientColumns.map(c => c.name);

  if (!clientColumnNames.includes('commission_percent')) {
    database.exec(`ALTER TABLE clients ADD COLUMN commission_percent REAL DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('payout_frequency')) {
    database.exec(`ALTER TABLE clients ADD COLUMN payout_frequency TEXT DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('payout_purpose')) {
    database.exec(`ALTER TABLE clients ADD COLUMN payout_purpose TEXT DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('payout_exclude_days')) {
    database.exec(`ALTER TABLE clients ADD COLUMN payout_exclude_days INTEGER DEFAULT 0`);
  }
  if (!clientColumnNames.includes('auto_payout_enabled')) {
    database.exec(`ALTER TABLE clients ADD COLUMN auto_payout_enabled INTEGER DEFAULT 0`);
  }
  if (!clientColumnNames.includes('next_payout_at')) {
    database.exec(`ALTER TABLE clients ADD COLUMN next_payout_at TEXT DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('document_filename')) {
    database.exec(`ALTER TABLE clients ADD COLUMN document_filename TEXT DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('document_mime_type')) {
    database.exec(`ALTER TABLE clients ADD COLUMN document_mime_type TEXT DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('document_uploaded_at')) {
    database.exec(`ALTER TABLE clients ADD COLUMN document_uploaded_at TEXT DEFAULT NULL`);
  }
  if (!clientColumnNames.includes('payout_virtual_account')) {
    database.exec(`ALTER TABLE clients ADD COLUMN payout_virtual_account TEXT DEFAULT NULL`);
  }

  database.exec(`CREATE INDEX IF NOT EXISTS idx_clients_auto_payout ON clients (auto_payout_enabled, next_payout_at)`);
}
