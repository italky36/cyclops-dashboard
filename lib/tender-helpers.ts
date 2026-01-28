import { getDb } from '@/lib/db';

export interface TenderHelpersPayer {
  id?: number;
  payer_bank_code: string;
  payer_account: string;
  is_default: boolean;
}

export interface TenderHelpersConfig {
  base_url: string | null;
  recipient_account: string | null;
  recipient_bank_code: string | null;
  test_payers: TenderHelpersPayer[];
  configured: boolean;
}

export const DEFAULT_TENDER_HELPERS_BASE_URL =
  'https://pre.tochka.com/api/v1/tender-helpers/';

export const DEFAULT_TENDER_HELPERS_PAYERS: TenderHelpersPayer[] = [
  {
    payer_bank_code: '044525104',
    payer_account: '40702810713500000456',
    is_default: true,
  },
  {
    payer_bank_code: '044525104',
    payer_account: '40702810403500000494',
    is_default: false,
  },
  {
    payer_bank_code: '044525104',
    payer_account: '40802810103500000306',
    is_default: false,
  },
];

function normalizeDefaultPayer(payers: TenderHelpersPayer[]): TenderHelpersPayer[] {
  const defaultIndex = payers.findIndex((payer) => payer.is_default);
  if (defaultIndex !== -1) {
    return payers.map((payer, index) => ({
      ...payer,
      is_default: index === defaultIndex,
    }));
  }

  if (payers.length === 0) {
    return payers;
  }

  return payers.map((payer, index) => ({
    ...payer,
    is_default: index === 0,
  }));
}

function ensureDefaultPayers() {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM tender_helpers_payers').get() as { count: number };
  if (row.count > 0) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO tender_helpers_payers
      (payer_bank_code, payer_account, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    DEFAULT_TENDER_HELPERS_PAYERS.forEach((payer) => {
      insert.run(
        payer.payer_bank_code,
        payer.payer_account,
        payer.is_default ? 1 : 0,
        now,
        now
      );
    });
  });

  tx();
}

export function getTenderHelpersConfig(): TenderHelpersConfig {
  const db = getDb();
  ensureDefaultPayers();

  const settings = db
    .prepare('SELECT base_url, recipient_account, recipient_bank_code FROM tender_helpers_settings LIMIT 1')
    .get() as {
      base_url: string;
      recipient_account: string;
      recipient_bank_code: string;
    } | undefined;

  const payers = db
    .prepare('SELECT id, payer_bank_code, payer_account, is_default FROM tender_helpers_payers ORDER BY id ASC')
    .all() as Array<{
      id: number;
      payer_bank_code: string;
      payer_account: string;
      is_default: number;
    }>;

  const normalizedPayers = normalizeDefaultPayer(
    payers.map((payer) => ({
      id: payer.id,
      payer_bank_code: payer.payer_bank_code,
      payer_account: payer.payer_account,
      is_default: payer.is_default === 1,
    }))
  );

  if (normalizedPayers.length > 0) {
    const defaultId = normalizedPayers.find((payer) => payer.is_default)?.id;
    if (defaultId) {
      db.prepare('UPDATE tender_helpers_payers SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END')
        .run(defaultId);
    }
  }

  return {
    base_url: settings?.base_url ?? null,
    recipient_account: settings?.recipient_account ?? null,
    recipient_bank_code: settings?.recipient_bank_code ?? null,
    test_payers: normalizedPayers,
    configured: Boolean(settings?.base_url && settings?.recipient_account && settings?.recipient_bank_code),
  };
}

export function saveTenderHelpersConfig(input: {
  base_url: string;
  recipient_account: string;
  recipient_bank_code: string;
  test_payers: TenderHelpersPayer[];
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const payers = normalizeDefaultPayer(input.test_payers);

  const upsertSettings = db.prepare(
    `INSERT INTO tender_helpers_settings
      (id, base_url, recipient_account, recipient_bank_code, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
      base_url = excluded.base_url,
      recipient_account = excluded.recipient_account,
      recipient_bank_code = excluded.recipient_bank_code,
      updated_at = excluded.updated_at`
  );

  const insertPayer = db.prepare(
    `INSERT INTO tender_helpers_payers
      (payer_bank_code, payer_account, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    upsertSettings.run(input.base_url, input.recipient_account, input.recipient_bank_code, now);
    db.prepare('DELETE FROM tender_helpers_payers').run();
    payers.forEach((payer) => {
      insertPayer.run(
        payer.payer_bank_code,
        payer.payer_account,
        payer.is_default ? 1 : 0,
        now,
        now
      );
    });
  });

  tx();
}

export function getDefaultTenderHelpersPayer(payers: TenderHelpersPayer[]): TenderHelpersPayer | null {
  if (payers.length === 0) {
    return null;
  }
  return payers.find((payer) => payer.is_default) || payers[0];
}
