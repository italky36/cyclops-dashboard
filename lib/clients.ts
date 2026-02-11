import { getDb } from './db';
import { logAction } from './vending';

// ============ ТИПЫ ============

export type PayoutType = 'payment_contract' | 'payment_contract_by_sbp_v2' | 'payment_contract_to_card';

export interface Client {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;

  payout_type: PayoutType;

  // Банковский перевод
  bank_account: string | null;
  bank_code: string | null;
  bank_name: string | null;
  inn: string | null;
  kpp: string | null;
  recipient_name: string | null;

  // СБП
  sbp_phone: string | null;
  sbp_bank_id: string | null;
  sbp_first_name: string | null;
  sbp_middle_name: string | null;
  sbp_last_name: string | null;

  // Карта
  card_number_encrypted: string | null;
  card_first_name: string | null;
  card_middle_name: string | null;
  card_last_name: string | null;

  beneficiary_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // Настройки автовыплат
  commission_percent: number | null;
  payout_frequency: 'weekly' | 'biweekly' | 'monthly' | null;
  payout_exclude_days: number;
  auto_payout_enabled: boolean;
  next_payout_at: string | null;

  // Документ (договор)
  document_filename: string | null;
  document_mime_type: string | null;
  document_uploaded_at: string | null;
}

export interface CreateClientInput {
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  payout_type: PayoutType;
  bank_account?: string;
  bank_code?: string;
  bank_name?: string;
  inn?: string;
  kpp?: string;
  recipient_name?: string;
  sbp_phone?: string;
  sbp_bank_id?: string;
  sbp_first_name?: string;
  sbp_middle_name?: string;
  sbp_last_name?: string;
  card_number_encrypted?: string;
  card_first_name?: string;
  card_middle_name?: string;
  card_last_name?: string;
  beneficiary_id?: string;
  notes?: string;
  commission_percent?: number;
  payout_frequency?: string;
  payout_exclude_days?: number;
}

export interface UpdateClientInput extends Partial<CreateClientInput> {
  is_active?: boolean;
  auto_payout_enabled?: boolean;
  next_payout_at?: string | null;
  document_filename?: string | null;
  document_mime_type?: string | null;
  document_uploaded_at?: string | null;
}

export interface ClientWithMachineCount extends Client {
  machine_count: number;
}

export interface PlatformSettings {
  payout_virtual_account: string | null;
  payout_purpose_template: string;
  updated_at: string;
}

// ============ CRUD КЛИЕНТОВ ============

function rowToClient(row: Record<string, unknown>): Client {
  return {
    ...row,
    is_active: row.is_active === 1,
    auto_payout_enabled: row.auto_payout_enabled === 1,
    payout_exclude_days: (row.payout_exclude_days as number) ?? 3,
  } as Client;
}

export function createClient(input: CreateClientInput, user_id?: string): Client {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO clients (
      name, contact_name, phone, email,
      payout_type,
      bank_account, bank_code, bank_name, inn, kpp, recipient_name,
      sbp_phone, sbp_bank_id, sbp_first_name, sbp_middle_name, sbp_last_name,
      card_number_encrypted, card_first_name, card_middle_name, card_last_name,
      beneficiary_id, notes, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    input.name,
    input.contact_name || null,
    input.phone || null,
    input.email || null,
    input.payout_type,
    input.bank_account || null,
    input.bank_code || null,
    input.bank_name || null,
    input.inn || null,
    input.kpp || null,
    input.recipient_name || null,
    input.sbp_phone || null,
    input.sbp_bank_id || null,
    input.sbp_first_name || null,
    input.sbp_middle_name || null,
    input.sbp_last_name || null,
    input.card_number_encrypted || null,
    input.card_first_name || null,
    input.card_middle_name || null,
    input.card_last_name || null,
    input.beneficiary_id || null,
    input.notes || null,
    now,
    now
  );

  logAction('create_client', 'client', String(result.lastInsertRowid), JSON.stringify({ user_id, name: input.name }));

  return getClientById(Number(result.lastInsertRowid))!;
}

export function updateClient(id: number, input: UpdateClientInput, user_id?: string): Client | null {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = getClientById(id);
  if (!existing) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  const addField = (name: string, value: unknown) => {
    if (value !== undefined) {
      fields.push(`${name} = ?`);
      values.push(value === '' ? null : value);
    }
  };

  addField('name', input.name);
  addField('contact_name', input.contact_name);
  addField('phone', input.phone);
  addField('email', input.email);
  addField('payout_type', input.payout_type);
  addField('bank_account', input.bank_account);
  addField('bank_code', input.bank_code);
  addField('bank_name', input.bank_name);
  addField('inn', input.inn);
  addField('kpp', input.kpp);
  addField('recipient_name', input.recipient_name);
  addField('sbp_phone', input.sbp_phone);
  addField('sbp_bank_id', input.sbp_bank_id);
  addField('sbp_first_name', input.sbp_first_name);
  addField('sbp_middle_name', input.sbp_middle_name);
  addField('sbp_last_name', input.sbp_last_name);
  addField('card_number_encrypted', input.card_number_encrypted);
  addField('card_first_name', input.card_first_name);
  addField('card_middle_name', input.card_middle_name);
  addField('card_last_name', input.card_last_name);
  addField('beneficiary_id', input.beneficiary_id);
  addField('notes', input.notes);
  addField('commission_percent', input.commission_percent);
  addField('payout_frequency', input.payout_frequency);
  addField('payout_exclude_days', input.payout_exclude_days);
  addField('next_payout_at', input.next_payout_at);
  addField('document_filename', input.document_filename);
  addField('document_mime_type', input.document_mime_type);
  addField('document_uploaded_at', input.document_uploaded_at);

  if (input.auto_payout_enabled !== undefined) {
    fields.push('auto_payout_enabled = ?');
    values.push(input.auto_payout_enabled ? 1 : 0);
  }

  if (input.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(input.is_active ? 1 : 0);
  }

  if (fields.length === 0) return existing;

  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  logAction('update_client', 'client', String(id), JSON.stringify({ user_id, fields: Object.keys(input) }));

  return getClientById(id)!;
}

export function getClientById(id: number): Client | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToClient(row);
}

export function getAllClients(filters?: { is_active?: boolean; search?: string }): ClientWithMachineCount[] {
  const db = getDb();
  let sql = `
    SELECT c.*, COUNT(CASE WHEN ma.unassigned_at IS NULL THEN 1 END) as machine_count
    FROM clients c
    LEFT JOIN machine_assignments ma ON c.id = ma.client_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters?.is_active !== undefined) {
    sql += ' AND c.is_active = ?';
    params.push(filters.is_active ? 1 : 0);
  }

  if (filters?.search) {
    sql += ' AND (c.name LIKE ? OR c.inn LIKE ? OR c.contact_name LIKE ?)';
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  sql += ' GROUP BY c.id ORDER BY c.name';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(row => ({
    ...rowToClient(row),
    machine_count: (row.machine_count as number) || 0,
  }));
}

export function deleteClient(id: number, user_id?: string): boolean {
  const db = getDb();

  // Проверяем, нет ли финансовой истории
  const hasPayouts = db.prepare(
    'SELECT 1 FROM beneficiary_payouts WHERE client_id = ? LIMIT 1'
  ).get(id);

  if (hasPayouts) {
    throw new Error('Невозможно удалить клиента с историей выплат');
  }

  // Снимаем все привязки машин
  db.prepare('UPDATE machine_assignments SET unassigned_at = ? WHERE client_id = ? AND unassigned_at IS NULL')
    .run(new Date().toISOString(), id);

  db.prepare('DELETE FROM clients WHERE id = ?').run(id);

  logAction('delete_client', 'client', String(id), JSON.stringify({ user_id }));

  return true;
}

// ============ ПРИВЯЗКА МАШИН К КЛИЕНТАМ ============

export function assignMachineToClient(params: {
  machine_id: number;
  client_id: number;
  commission_percent: number;
  beneficiary_id?: string;
  created_by?: string;
}): void {
  const db = getDb();
  const now = new Date().toISOString();

  // Проверяем, нет ли уже активной привязки для этого автомата
  const existing = db.prepare(`
    SELECT id FROM machine_assignments
    WHERE machine_id = ? AND unassigned_at IS NULL
  `).get(params.machine_id);

  if (existing) {
    throw new Error('Автомат уже привязан к другому клиенту/бенефициару');
  }

  // Получаем beneficiary_id из клиента, если не передан
  let beneficiary_id = params.beneficiary_id;
  if (!beneficiary_id) {
    const client = getClientById(params.client_id);
    beneficiary_id = client?.beneficiary_id || '';
  }

  db.prepare(`
    INSERT INTO machine_assignments (machine_id, beneficiary_id, client_id, commission_percent, assigned_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.machine_id,
    beneficiary_id,
    params.client_id,
    params.commission_percent,
    now,
    params.created_by || null
  );

  logAction('assign_machine_to_client', 'machine_assignment', null, JSON.stringify(params));
}

export function unassignMachineFromClient(assignment_id: number, user_id?: string): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare('UPDATE machine_assignments SET unassigned_at = ? WHERE id = ? AND unassigned_at IS NULL')
    .run(now, assignment_id);

  logAction('unassign_machine_from_client', 'machine_assignment', String(assignment_id), JSON.stringify({ user_id }));
}

export function getMachinesByClient(client_id: number) {
  const db = getDb();
  return db.prepare(`
    SELECT m.*, a.id as assignment_id, a.commission_percent, a.assigned_at, a.beneficiary_id
    FROM vending_machines m
    JOIN machine_assignments a ON m.id = a.machine_id
    WHERE a.client_id = ? AND a.unassigned_at IS NULL
    ORDER BY a.assigned_at DESC
  `).all(client_id) as Array<{
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
    beneficiary_id: string;
  }>;
}

export function getClientsWithMachines(): number[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT client_id FROM machine_assignments
    WHERE client_id IS NOT NULL AND unassigned_at IS NULL
  `).all() as Array<{ client_id: number }>;
  return rows.map(r => r.client_id);
}

// ============ НАСТРОЙКИ ПЛАТФОРМЫ ============

export function getPlatformSettings(): PlatformSettings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM platform_settings WHERE id = 1').get() as Record<string, unknown> | undefined;

  if (!row) {
    return {
      payout_virtual_account: null,
      payout_purpose_template: 'Выплата по договору за период {period}',
      updated_at: new Date().toISOString(),
    };
  }

  return {
    payout_virtual_account: row.payout_virtual_account as string | null,
    payout_purpose_template: (row.payout_purpose_template as string) || 'Выплата по договору за период {period}',
    updated_at: row.updated_at as string,
  };
}

export function updatePlatformSettings(params: {
  payout_virtual_account?: string;
  payout_purpose_template?: string;
}, user_id?: string): PlatformSettings {
  const db = getDb();
  const now = new Date().toISOString();
  const current = getPlatformSettings();

  const va = params.payout_virtual_account ?? current.payout_virtual_account;
  const template = params.payout_purpose_template ?? current.payout_purpose_template;

  db.prepare(`
    INSERT INTO platform_settings (id, payout_virtual_account, payout_purpose_template, updated_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      payout_virtual_account = excluded.payout_virtual_account,
      payout_purpose_template = excluded.payout_purpose_template,
      updated_at = excluded.updated_at
  `).run(va, template, now);

  logAction('update_platform_settings', 'platform_settings', '1', JSON.stringify({ user_id, ...params }));

  return getPlatformSettings();
}

// ============ РАСЧЁТ ВЫПЛАТ ПО КЛИЕНТАМ ============

export interface ClientPayoutCalculation {
  client_id: number;
  client_name: string;
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

export function calculateClientPayout(
  client_id: number,
  transactions: Array<{ id: string | number; machine_id: string | number; date: string; amount: number }>,
  end_date?: string
): ClientPayoutCalculation {
  const db = getDb();
  const client = getClientById(client_id);
  if (!client) {
    throw new Error(`Клиент ${client_id} не найден`);
  }

  const now = end_date || new Date().toISOString().split('T')[0];
  const machines = getMachinesByClient(client_id);

  if (machines.length === 0) {
    return {
      client_id,
      client_name: client.name,
      period_start: now,
      period_end: now,
      machines: [],
      total_sales: 0,
      total_commission: 0,
      payout_amount: 0,
    };
  }

  // Последняя успешная выплата для определения начала периода
  const lastPayout = db.prepare(`
    SELECT period_end FROM beneficiary_payouts
    WHERE client_id = ? AND status = 'completed'
    ORDER BY period_end DESC LIMIT 1
  `).get(client_id) as { period_end: string } | undefined;

  const machineResults: ClientPayoutCalculation['machines'] = [];
  let periodStart = now;

  for (const machine of machines) {
    const assignmentDate = machine.assigned_at.split('T')[0];
    const startDate = lastPayout
      ? (assignmentDate > lastPayout.period_end ? assignmentDate : lastPayout.period_end)
      : assignmentDate;

    if (startDate < periodStart) {
      periodStart = startDate;
    }

    const machineTransactions = transactions.filter(t => {
      const transaction_term_id = String(t.machine_id);
      const txDate = t.date.split('T')[0];
      const machine_term_id = machine.terminal_id || machine.vendista_id;
      return transaction_term_id === machine_term_id && txDate >= startDate && txDate <= now;
    });

    const sales_amount = machineTransactions.reduce((sum, t) => sum + t.amount, 0);
    const commission_percent = machine.commission_percent;
    const commission_amount = Math.round(sales_amount * (commission_percent / 100) * 100) / 100;
    const net_amount = Math.round((sales_amount - commission_amount) * 100) / 100;

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

  return {
    client_id,
    client_name: client.name,
    period_start: periodStart,
    period_end: now,
    machines: machineResults,
    total_sales: machineResults.reduce((sum, m) => sum + m.sales_amount, 0),
    total_commission: machineResults.reduce((sum, m) => sum + m.commission_amount, 0),
    payout_amount: machineResults.reduce((sum, m) => sum + m.net_amount, 0),
  };
}

// ============ ФОРМИРОВАНИЕ ПАРАМЕТРОВ CYCLOPS DEAL ============

export function buildDealParamsForClient(
  client: Client,
  payerVirtualAccount: string,
  amount: number,
  purpose: string,
  extKey?: string
): {
  amount: number;
  ext_key?: string;
  payers: Array<{ virtual_account: string; amount: number }>;
  recipients: Array<Record<string, unknown>>;
} {
  const roundAmount = (v: number) => Math.round(v * 100) / 100;
  const dealAmount = roundAmount(amount);

  const payers = [{ virtual_account: payerVirtualAccount, amount: dealAmount }];

  let recipient: Record<string, unknown>;

  switch (client.payout_type) {
    case 'payment_contract':
      recipient = {
        type: 'payment_contract',
        number: 1,
        amount: dealAmount,
        account: client.bank_account!,
        bank_code: client.bank_code!,
        name: client.recipient_name || client.name,
        inn: client.inn!,
        kpp: client.kpp || undefined,
        purpose,
      };
      break;

    case 'payment_contract_by_sbp_v2':
      recipient = {
        type: 'payment_contract_by_sbp_v2',
        number: 1,
        amount: dealAmount,
        first_name: client.sbp_first_name!,
        middle_name: client.sbp_middle_name || undefined,
        last_name: client.sbp_last_name!,
        phone_number: client.sbp_phone!,
        bank_sbp_id: client.sbp_bank_id!,
        purpose,
        inn: client.inn || undefined,
      };
      break;

    case 'payment_contract_to_card':
      recipient = {
        type: 'payment_contract_to_card',
        number: 1,
        amount: dealAmount,
        card_number_crypto_base64: client.card_number_encrypted!,
        recipient_fio: {
          first_name: client.card_first_name!,
          last_name: client.card_last_name!,
          middle_name: client.card_middle_name || undefined,
        },
        purpose,
        inn: client.inn || undefined,
      };
      break;
  }

  // Убираем undefined поля
  const cleanRecipient: Record<string, unknown> = {};
  for (const key of Object.keys(recipient!)) {
    const val = (recipient as Record<string, unknown>)[key];
    if (val !== undefined) {
      cleanRecipient[key] = val;
    }
  }

  return {
    amount: dealAmount,
    ext_key: extKey,
    payers,
    recipients: [cleanRecipient],
  };
}

// ============ ЗАПИСЬ ВЫПЛАТЫ КЛИЕНТУ ============

export function createClientPayout(
  calculation: ClientPayoutCalculation,
  user_id?: string
): { id: number; status: string } {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO beneficiary_payouts (
      beneficiary_id, client_id, period_start, period_end, total_sales,
      commission_amount, payout_amount, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    '', // beneficiary_id пустой для клиентских выплат
    calculation.client_id,
    calculation.period_start,
    calculation.period_end,
    calculation.total_sales,
    calculation.total_commission,
    calculation.payout_amount,
    now
  );

  const payout_id = Number(result.lastInsertRowid);

  // Детали по машинам
  const detailStmt = db.prepare(`
    INSERT INTO payout_details (payout_id, machine_id, sales_amount, commission_percent, commission_amount, net_amount)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const machine of calculation.machines) {
    detailStmt.run(payout_id, machine.machine_id, machine.sales_amount, machine.commission_percent, machine.commission_amount, machine.net_amount);
  }

  logAction('create_client_payout', 'beneficiary_payout', String(payout_id), JSON.stringify({ user_id, client_id: calculation.client_id }));

  return { id: payout_id, status: 'pending' };
}

// ============ РАСЧЁТ ВЫПЛАТ С ЕДИНОЙ КОМИССИЕЙ КЛИЕНТА ============

/**
 * Расчёт выплаты с использованием клиентской комиссии (единый % для всех машин).
 * Если у клиента не задан commission_percent — фолбэк на per-machine расчёт.
 */
export function calculateClientPayoutUnified(
  client_id: number,
  transactions: Array<{ id: string | number; machine_id: string | number; date: string; amount: number }>,
  end_date?: string
): ClientPayoutCalculation {
  const client = getClientById(client_id);
  if (!client) {
    throw new Error(`Клиент ${client_id} не найден`);
  }

  const commissionPercent = client.commission_percent;
  if (commissionPercent === null || commissionPercent === undefined) {
    return calculateClientPayout(client_id, transactions, end_date);
  }

  const db = getDb();
  const now = end_date || new Date().toISOString().split('T')[0];
  const machines = getMachinesByClient(client_id);

  if (machines.length === 0) {
    return {
      client_id,
      client_name: client.name,
      period_start: now,
      period_end: now,
      machines: [],
      total_sales: 0,
      total_commission: 0,
      payout_amount: 0,
    };
  }

  // Последняя успешная выплата для определения начала периода
  const lastPayout = db.prepare(`
    SELECT period_end FROM beneficiary_payouts
    WHERE client_id = ? AND status = 'completed'
    ORDER BY period_end DESC LIMIT 1
  `).get(client_id) as { period_end: string } | undefined;

  const machineResults: ClientPayoutCalculation['machines'] = [];
  let periodStart = now;

  for (const machine of machines) {
    const assignmentDate = machine.assigned_at.split('T')[0];
    const startDate = lastPayout
      ? (assignmentDate > lastPayout.period_end ? assignmentDate : lastPayout.period_end)
      : assignmentDate;

    if (startDate < periodStart) {
      periodStart = startDate;
    }

    const machineTransactions = transactions.filter(t => {
      const transaction_term_id = String(t.machine_id);
      const txDate = t.date.split('T')[0];
      const machine_term_id = machine.terminal_id || machine.vendista_id;
      return transaction_term_id === machine_term_id && txDate >= startDate && txDate <= now;
    });

    const sales_amount = machineTransactions.reduce((sum, t) => sum + t.amount, 0);
    // Единая комиссия клиента для всех машин
    const commission_amount = Math.round(sales_amount * (commissionPercent / 100) * 100) / 100;
    const net_amount = Math.round((sales_amount - commission_amount) * 100) / 100;

    machineResults.push({
      machine_id: machine.id,
      vendista_id: machine.vendista_id,
      machine_name: machine.name,
      sales_amount,
      commission_percent: commissionPercent,
      commission_amount,
      net_amount,
    });
  }

  const total_sales = machineResults.reduce((sum, m) => sum + m.sales_amount, 0);
  const total_commission = Math.round(total_sales * (commissionPercent / 100) * 100) / 100;
  const payout_amount = Math.round((total_sales - total_commission) * 100) / 100;

  return {
    client_id,
    client_name: client.name,
    period_start: periodStart,
    period_end: now,
    machines: machineResults,
    total_sales,
    total_commission,
    payout_amount,
  };
}

// ============ АВТОВЫПЛАТЫ: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

/**
 * Возвращает клиентов, для которых подошло время автовыплаты.
 * Требует: auto_payout_enabled, активность, комиссию, документ, наступившую дату.
 */
export function getClientsForAutoPayout(currentDate: string): Client[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM clients
    WHERE auto_payout_enabled = 1
      AND is_active = 1
      AND commission_percent IS NOT NULL
      AND payout_frequency IS NOT NULL
      AND next_payout_at IS NOT NULL
      AND next_payout_at <= ?
      AND document_filename IS NOT NULL
  `).all(currentDate) as Array<Record<string, unknown>>;
  return rows.map(rowToClient);
}

/**
 * Вычисляет дату следующей автовыплаты на основе частоты.
 */
export function computeNextPayoutDate(frequency: string, fromDate: string): string {
  const d = new Date(fromDate);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}
