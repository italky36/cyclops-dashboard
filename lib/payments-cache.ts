import { getDb } from '@/lib/db';

export type CachedPayment = {
  layer: 'pre' | 'prod';
  payment_id: string;
  incoming: boolean | null;
  payer_account: string | null;
  payer_bank_code: string | null;
  recipient_account: string | null;
  recipient_bank_code: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

const normalizeId = (value?: string) => (value && value !== 'undefined' ? value : '');

export function upsertPaymentsFromList(
  layer: 'pre' | 'prod',
  list: Array<Record<string, unknown>>
): void {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO payments_cache (
      layer, payment_id, incoming, payer_account, payer_bank_code,
      recipient_account, recipient_bank_code, first_seen_at, last_seen_at
    ) VALUES (
      @layer, @payment_id, @incoming, @payer_account, @payer_bank_code,
      @recipient_account, @recipient_bank_code, @first_seen_at, @last_seen_at
    )
    ON CONFLICT(layer, payment_id) DO UPDATE SET
      incoming = COALESCE(excluded.incoming, payments_cache.incoming),
      payer_account = COALESCE(excluded.payer_account, payments_cache.payer_account),
      payer_bank_code = COALESCE(excluded.payer_bank_code, payments_cache.payer_bank_code),
      recipient_account = COALESCE(excluded.recipient_account, payments_cache.recipient_account),
      recipient_bank_code = COALESCE(excluded.recipient_bank_code, payments_cache.recipient_bank_code),
      last_seen_at = excluded.last_seen_at
  `);

  const tx = db.transaction((rows: Array<Record<string, unknown>>) => {
    rows.forEach((row) => {
      const payment_id = normalizeId((row.payment_id as string) || (row.id as string));
      if (!payment_id) return;
      const incomingValue =
        typeof row.incoming === 'boolean' ? Number(row.incoming) : null;
      stmt.run({
        layer,
        payment_id,
        incoming: incomingValue,
        payer_account: typeof row.payer_account === 'string' ? row.payer_account : null,
        payer_bank_code: typeof row.payer_bank_code === 'string' ? row.payer_bank_code : null,
        recipient_account: typeof row.recipient_account === 'string' ? row.recipient_account : null,
        recipient_bank_code: typeof row.recipient_bank_code === 'string' ? row.recipient_bank_code : null,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
      });
    });
  });

  tx(list);
}

export function getCachedPaymentsByIds(
  layer: 'pre' | 'prod',
  ids: string[]
): CachedPayment[] {
  if (!ids.length) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT * FROM payments_cache WHERE layer = ? AND payment_id IN (${placeholders})`
    )
    .all(layer, ...ids) as CachedPayment[];
}

export function mapCachedPayments(
  list: Array<Record<string, unknown>>,
  cached: CachedPayment[]
): Array<Record<string, unknown>> {
  const map = new Map(cached.map((c) => [c.payment_id, c]));
  return list.map((item) => {
    const paymentId = normalizeId((item.payment_id as string) || (item.id as string));
    const cachedItem = paymentId ? map.get(paymentId) : undefined;
    if (!cachedItem) return item;
    return {
      ...item,
      first_seen_at: cachedItem.first_seen_at,
      last_seen_at: cachedItem.last_seen_at,
    };
  });
}
