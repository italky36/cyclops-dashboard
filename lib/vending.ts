import { getDb } from './db';
import type { VendistaMachine, VendistaTransaction } from './vendista';

// ============ ТИПЫ ============

export interface VendingMachine {
  id: number;
  vendista_id: string;
  name: string | null;
  model: string | null;
  address: string | null;
  serial_number: string | null;
  terminal_id: string | null;
  is_active: boolean;
  synced_at: string;
  created_at: string;
}

export interface MachineAssignment {
  id: number;
  machine_id: number;
  beneficiary_id: string;
  commission_percent: number;
  assigned_at: string;
  unassigned_at: string | null;
  created_by: string | null;
}

export interface MachineWithAssignment extends VendingMachine {
  assignment?: MachineAssignment;
  beneficiary_name?: string;
}

export interface BeneficiaryPayout {
  id: number;
  beneficiary_id: string;
  period_start: string;
  period_end: string;
  total_sales: number;
  commission_amount: number;
  payout_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  cyclops_deal_id: string | null;
  cyclops_response: string | null;
  error_message: string | null;
  created_at: string;
  executed_at: string | null;
}

export interface PayoutDetail {
  id: number;
  payout_id: number;
  machine_id: number;
  sales_amount: number;
  commission_percent: number;
  commission_amount: number;
  net_amount: number;
}

export interface PayoutSchedule {
  id: number;
  cron_expression: string;
  is_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: string | null;
  user_id: string | null;
  created_at: string;
}

// ============ ТОРГОВЫЕ АВТОМАТЫ ============

/**
 * Синхронизация автоматов из Vendista в локальную БД
 */
export function syncMachines(machines: VendistaMachine[]): number {
  const db = getDb();
  const now = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO vending_machines (vendista_id, name, model, address, serial_number, terminal_id, is_active, synced_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vendista_id) DO UPDATE SET
      name = excluded.name,
      model = excluded.model,
      address = excluded.address,
      serial_number = excluded.serial_number,
      terminal_id = excluded.terminal_id,
      is_active = excluded.is_active,
      synced_at = excluded.synced_at
  `);

  let count = 0;
  for (const machine of machines) {
    const vendista_id = String(machine.id);
    const name = machine.name || null;
    const model = machine.model || null;
    const address = machine.address || null;
    const serial_number = machine.number ? String(machine.number) : null;
    const terminal_id = machine.terminal_id ? String(machine.terminal_id) : null;
    const is_active = machine.state_id === 1 ? 1 : 0;

    insertStmt.run(vendista_id, name, model, address, serial_number, terminal_id, is_active, now, now);
    count++;
  }

  logAction('sync_machines', 'vending_machine', null, JSON.stringify({ count }));

  return count;
}

/**
 * Получение всех торговых автоматов
 */
export function getAllMachines(): VendingMachine[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM vending_machines ORDER BY name, vendista_id
  `).all() as Array<{
    id: number;
    vendista_id: string;
    name: string | null;
    model: string | null;
    address: string | null;
    serial_number: string | null;
    terminal_id: string | null;
    is_active: number;
    synced_at: string;
    created_at: string;
  }>;

  return rows.map(row => ({
    ...row,
    is_active: row.is_active === 1,
  }));
}

/**
 * Получение автомата по ID
 */
export function getMachineById(id: number): VendingMachine | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM vending_machines WHERE id = ?`).get(id) as {
    id: number;
    vendista_id: string;
    name: string | null;
    model: string | null;
    address: string | null;
    serial_number: string | null;
    terminal_id: string | null;
    is_active: number;
    synced_at: string;
    created_at: string;
  } | undefined;

  if (!row) return null;

  return {
    ...row,
    is_active: row.is_active === 1,
  };
}

/**
 * Получение автоматов без активной привязки
 */
export function getUnassignedMachines(): VendingMachine[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.* FROM vending_machines m
    LEFT JOIN machine_assignments a ON m.id = a.machine_id AND a.unassigned_at IS NULL
    WHERE a.id IS NULL AND m.is_active = 1
    ORDER BY m.name, m.vendista_id
  `).all() as Array<{
    id: number;
    vendista_id: string;
    name: string | null;
    model: string | null;
    address: string | null;
    serial_number: string | null;
    terminal_id: string | null;
    is_active: number;
    synced_at: string;
    created_at: string;
  }>;

  return rows.map(row => ({
    ...row,
    is_active: row.is_active === 1,
  }));
}

// ============ ПРИВЯЗКИ АВТОМАТОВ ============

/**
 * Привязка автомата к бенефициару
 */
export function assignMachine(params: {
  machine_id: number;
  beneficiary_id: string;
  commission_percent: number;
  created_by?: string;
}): MachineAssignment {
  const db = getDb();
  const now = new Date().toISOString();

  // Проверяем, нет ли уже активной привязки для этого автомата
  const existing = db.prepare(`
    SELECT id FROM machine_assignments
    WHERE machine_id = ? AND unassigned_at IS NULL
  `).get(params.machine_id);

  if (existing) {
    throw new Error('Machine is already assigned to a beneficiary');
  }

  const result = db.prepare(`
    INSERT INTO machine_assignments (machine_id, beneficiary_id, commission_percent, assigned_at, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(params.machine_id, params.beneficiary_id, params.commission_percent, now, params.created_by || null);

  logAction('assign_machine', 'machine_assignment', String(result.lastInsertRowid), JSON.stringify(params));

  return {
    id: Number(result.lastInsertRowid),
    machine_id: params.machine_id,
    beneficiary_id: params.beneficiary_id,
    commission_percent: params.commission_percent,
    assigned_at: now,
    unassigned_at: null,
    created_by: params.created_by || null,
  };
}

/**
 * Отвязка автомата от бенефициара
 */
export function unassignMachine(assignment_id: number, user_id?: string): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE machine_assignments SET unassigned_at = ? WHERE id = ? AND unassigned_at IS NULL
  `).run(now, assignment_id);

  logAction('unassign_machine', 'machine_assignment', String(assignment_id), JSON.stringify({ user_id }));
}

/**
 * Получение активных привязок для бенефициара
 */
export function getMachinesByBeneficiary(beneficiary_id: string): MachineWithAssignment[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.*, a.id as assignment_id, a.commission_percent, a.assigned_at, a.unassigned_at, a.created_by
    FROM vending_machines m
    JOIN machine_assignments a ON m.id = a.machine_id
    WHERE a.beneficiary_id = ? AND a.unassigned_at IS NULL
    ORDER BY a.assigned_at DESC
  `).all(beneficiary_id) as Array<{
    id: number;
    vendista_id: string;
    name: string | null;
    model: string | null;
    address: string | null;
    serial_number: string | null;
    terminal_id: string | null;
    is_active: number;
    synced_at: string;
    created_at: string;
    assignment_id: number;
    commission_percent: number;
    assigned_at: string;
    unassigned_at: string | null;
    created_by: string | null;
  }>;

  return rows.map(row => ({
    id: row.id,
    vendista_id: row.vendista_id,
    name: row.name,
    model: row.model,
    address: row.address,
    serial_number: row.serial_number,
    terminal_id: row.terminal_id,
    is_active: row.is_active === 1,
    synced_at: row.synced_at,
    created_at: row.created_at,
    assignment: {
      id: row.assignment_id,
      machine_id: row.id,
      beneficiary_id: beneficiary_id,
      commission_percent: row.commission_percent,
      assigned_at: row.assigned_at,
      unassigned_at: row.unassigned_at,
      created_by: row.created_by,
    },
  }));
}

/**
 * Получение истории привязок для автомата
 */
export function getAssignmentHistory(machine_id: number): MachineAssignment[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM machine_assignments WHERE machine_id = ? ORDER BY assigned_at DESC
  `).all(machine_id) as MachineAssignment[];

  return rows;
}

/**
 * Получение всех привязок (активных)
 */
export function getAllActiveAssignments(): (MachineAssignment & { machine: VendingMachine })[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT a.*, m.vendista_id, m.name as machine_name, m.address, m.is_active as machine_is_active
    FROM machine_assignments a
    JOIN vending_machines m ON a.machine_id = m.id
    WHERE a.unassigned_at IS NULL
    ORDER BY a.assigned_at DESC
  `).all() as Array<MachineAssignment & {
    vendista_id: string;
    machine_name: string | null;
    address: string | null;
    machine_is_active: number;
  }>;

  return rows.map(row => ({
    ...row,
    machine: {
      id: row.machine_id,
      vendista_id: row.vendista_id,
      name: row.machine_name,
      model: null,
      address: row.address,
      serial_number: null,
      terminal_id: null,
      is_active: row.machine_is_active === 1,
      synced_at: '',
      created_at: '',
    },
  }));
}

// ============ РАСЧЕТ И ВЫПЛАТЫ ============

export interface PayoutCalculation {
  beneficiary_id: string;
  period_start: string;
  period_end: string;
  machines: Array<{
    machine_id: number;
    vendista_id: string;
    machine_name: string | null;
    sales_amount: number;
    commission_percent: number;
    commission_amount: number;
    net_amount: number;
  }>;
  total_sales: number;
  total_commission: number;
  payout_amount: number;
}

/**
 * Расчет суммы к выплате для бенефициара
 * Учитывает только невыплаченные продажи с момента привязки или последней выплаты
 */
export function calculatePayout(
  beneficiary_id: string,
  transactions: VendistaTransaction[],
  end_date?: string
): PayoutCalculation {
  const db = getDb();
  const now = end_date || new Date().toISOString().split('T')[0];

  // Получаем активные привязки для бенефициара
  const assignments = getMachinesByBeneficiary(beneficiary_id);

  if (assignments.length === 0) {
    return {
      beneficiary_id,
      period_start: now,
      period_end: now,
      machines: [],
      total_sales: 0,
      total_commission: 0,
      payout_amount: 0,
    };
  }

  // Находим последнюю успешную выплату для определения начала периода
  const lastPayout = db.prepare(`
    SELECT period_end FROM beneficiary_payouts
    WHERE beneficiary_id = ? AND status = 'completed'
    ORDER BY period_end DESC LIMIT 1
  `).get(beneficiary_id) as { period_end: string } | undefined;

  const machineResults: PayoutCalculation['machines'] = [];
  let periodStart = now;

  for (const machine of assignments) {
    // Определяем начало периода для этого автомата
    // Берем максимум из: даты привязки и даты последней выплаты
    const assignmentDate = machine.assignment!.assigned_at.split('T')[0];
    const startDate = lastPayout
      ? (assignmentDate > lastPayout.period_end ? assignmentDate : lastPayout.period_end)
      : assignmentDate;

    if (startDate < periodStart) {
      periodStart = startDate;
    }

    // Фильтруем транзакции по этому автомату за период
    const machineTransactions = transactions.filter(t => {
      const vendista_id = String(t.machine_id);
      const txDate = t.date.split('T')[0];
      return vendista_id === machine.vendista_id && txDate >= startDate && txDate <= now;
    });

    const sales_amount = machineTransactions.reduce((sum, t) => sum + t.amount, 0);
    const commission_percent = machine.assignment!.commission_percent;
    const commission_amount = sales_amount * (commission_percent / 100);
    const net_amount = sales_amount - commission_amount;

    machineResults.push({
      machine_id: machine.id,
      vendista_id: machine.vendista_id,
      machine_name: machine.name,
      sales_amount,
      commission_percent,
      commission_amount,
      net_amount,
    });
  }

  const total_sales = machineResults.reduce((sum, m) => sum + m.sales_amount, 0);
  const total_commission = machineResults.reduce((sum, m) => sum + m.commission_amount, 0);
  const payout_amount = machineResults.reduce((sum, m) => sum + m.net_amount, 0);

  return {
    beneficiary_id,
    period_start: periodStart,
    period_end: now,
    machines: machineResults,
    total_sales,
    total_commission,
    payout_amount,
  };
}

/**
 * Создание записи о выплате
 */
export function createPayout(calculation: PayoutCalculation, user_id?: string): BeneficiaryPayout {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO beneficiary_payouts (
      beneficiary_id, period_start, period_end, total_sales,
      commission_amount, payout_amount, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    calculation.beneficiary_id,
    calculation.period_start,
    calculation.period_end,
    calculation.total_sales,
    calculation.total_commission,
    calculation.payout_amount,
    now
  );

  const payout_id = Number(result.lastInsertRowid);

  // Сохраняем детали по каждому автомату
  const detailStmt = db.prepare(`
    INSERT INTO payout_details (payout_id, machine_id, sales_amount, commission_percent, commission_amount, net_amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const machine of calculation.machines) {
    detailStmt.run(
      payout_id,
      machine.machine_id,
      machine.sales_amount,
      machine.commission_percent,
      machine.commission_amount,
      machine.net_amount
    );
  }

  logAction('create_payout', 'beneficiary_payout', String(payout_id), JSON.stringify({ user_id, calculation }));

  return {
    id: payout_id,
    beneficiary_id: calculation.beneficiary_id,
    period_start: calculation.period_start,
    period_end: calculation.period_end,
    total_sales: calculation.total_sales,
    commission_amount: calculation.total_commission,
    payout_amount: calculation.payout_amount,
    status: 'pending',
    cyclops_deal_id: null,
    cyclops_response: null,
    error_message: null,
    created_at: now,
    executed_at: null,
  };
}

/**
 * Обновление статуса выплаты
 */
export function updatePayoutStatus(
  payout_id: number,
  status: BeneficiaryPayout['status'],
  cyclops_deal_id?: string,
  cyclops_response?: string,
  error_message?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE beneficiary_payouts SET
      status = ?,
      cyclops_deal_id = COALESCE(?, cyclops_deal_id),
      cyclops_response = COALESCE(?, cyclops_response),
      error_message = COALESCE(?, error_message),
      executed_at = CASE WHEN ? = 'completed' THEN ? ELSE executed_at END
    WHERE id = ?
  `).run(status, cyclops_deal_id || null, cyclops_response || null, error_message || null, status, now, payout_id);

  logAction('update_payout_status', 'beneficiary_payout', String(payout_id), JSON.stringify({ status, cyclops_deal_id }));
}

/**
 * Получение выплаты по ID
 */
export function getPayoutById(payout_id: number): BeneficiaryPayout | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM beneficiary_payouts WHERE id = ?`).get(payout_id) as BeneficiaryPayout | undefined;
  return row || null;
}

/**
 * Получение истории выплат
 */
export function getPayoutHistory(filters?: {
  beneficiary_id?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}): BeneficiaryPayout[] {
  const db = getDb();
  let sql = `SELECT * FROM beneficiary_payouts WHERE 1=1`;
  const params: unknown[] = [];

  if (filters?.beneficiary_id) {
    sql += ` AND beneficiary_id = ?`;
    params.push(filters.beneficiary_id);
  }
  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters?.date_from) {
    sql += ` AND period_start >= ?`;
    params.push(filters.date_from);
  }
  if (filters?.date_to) {
    sql += ` AND period_end <= ?`;
    params.push(filters.date_to);
  }

  sql += ` ORDER BY created_at DESC`;

  return db.prepare(sql).all(...params) as BeneficiaryPayout[];
}

/**
 * Получение деталей выплаты
 */
export function getPayoutDetails(payout_id: number): PayoutDetail[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM payout_details WHERE payout_id = ?`).all(payout_id) as PayoutDetail[];
}

// ============ РАСПИСАНИЕ АВТОМАТИЧЕСКИХ ВЫПЛАТ ============

/**
 * Получение настроек расписания
 */
export function getPayoutSchedule(): PayoutSchedule | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM payout_schedule ORDER BY id DESC LIMIT 1`).get() as PayoutSchedule | undefined;

  if (!row) return null;

  return {
    ...row,
    is_enabled: row.is_enabled === 1 as unknown as boolean,
  };
}

/**
 * Обновление настроек расписания
 */
export function updatePayoutSchedule(params: {
  cron_expression: string;
  is_enabled: boolean;
  updated_by?: string;
}): PayoutSchedule {
  const db = getDb();
  const now = new Date().toISOString();

  // Проверяем существует ли запись
  const existing = getPayoutSchedule();

  if (existing) {
    db.prepare(`
      UPDATE payout_schedule SET
        cron_expression = ?, is_enabled = ?, updated_at = ?, updated_by = ?
      WHERE id = ?
    `).run(params.cron_expression, params.is_enabled ? 1 : 0, now, params.updated_by || null, existing.id);

    logAction('update_payout_schedule', 'payout_schedule', String(existing.id), JSON.stringify(params));

    return {
      ...existing,
      cron_expression: params.cron_expression,
      is_enabled: params.is_enabled,
      updated_at: now,
      updated_by: params.updated_by || null,
    };
  } else {
    const result = db.prepare(`
      INSERT INTO payout_schedule (cron_expression, is_enabled, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
    `).run(params.cron_expression, params.is_enabled ? 1 : 0, now, params.updated_by || null);

    logAction('create_payout_schedule', 'payout_schedule', String(result.lastInsertRowid), JSON.stringify(params));

    return {
      id: Number(result.lastInsertRowid),
      cron_expression: params.cron_expression,
      is_enabled: params.is_enabled,
      last_run_at: null,
      next_run_at: null,
      updated_at: now,
      updated_by: params.updated_by || null,
    };
  }
}

/**
 * Обновление времени последнего запуска
 */
export function updateScheduleLastRun(): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`UPDATE payout_schedule SET last_run_at = ?`).run(now);
}

// ============ АУДИТ ЛОГ ============

/**
 * Запись в лог действий
 */
export function logAction(
  action: string,
  entity_type: string,
  entity_id: string | null,
  details?: string,
  user_id?: string
): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO audit_log (action, entity_type, entity_id, details, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(action, entity_type, entity_id, details || null, user_id || null, now);
}

/**
 * Получение лога действий
 */
export function getAuditLog(filters?: {
  entity_type?: string;
  entity_id?: string;
  action?: string;
  limit?: number;
}): AuditLogEntry[] {
  const db = getDb();
  let sql = `SELECT * FROM audit_log WHERE 1=1`;
  const params: unknown[] = [];

  if (filters?.entity_type) {
    sql += ` AND entity_type = ?`;
    params.push(filters.entity_type);
  }
  if (filters?.entity_id) {
    sql += ` AND entity_id = ?`;
    params.push(filters.entity_id);
  }
  if (filters?.action) {
    sql += ` AND action = ?`;
    params.push(filters.action);
  }

  sql += ` ORDER BY created_at DESC`;

  if (filters?.limit) {
    sql += ` LIMIT ?`;
    params.push(filters.limit);
  }

  return db.prepare(sql).all(...params) as AuditLogEntry[];
}

// ============ ПРОВЕРКА ЦЕЛОСТНОСТИ ============

/**
 * Проверка, можно ли удалить автомат (нет финансовой истории)
 */
export function canDeleteMachine(machine_id: number): boolean {
  const db = getDb();
  const hasPayouts = db.prepare(`
    SELECT 1 FROM payout_details WHERE machine_id = ? LIMIT 1
  `).get(machine_id);

  return !hasPayouts;
}

/**
 * Проверка, можно ли удалить бенефициара (нет финансовой истории)
 */
export function canDeleteBeneficiary(beneficiary_id: string): boolean {
  const db = getDb();
  const hasPayouts = db.prepare(`
    SELECT 1 FROM beneficiary_payouts WHERE beneficiary_id = ? LIMIT 1
  `).get(beneficiary_id);

  return !hasPayouts;
}

/**
 * Получение всех бенефициаров с активными привязками
 */
export function getBeneficiariesWithMachines(): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT beneficiary_id FROM machine_assignments WHERE unassigned_at IS NULL
  `).all() as Array<{ beneficiary_id: string }>;

  return rows.map(r => r.beneficiary_id);
}
