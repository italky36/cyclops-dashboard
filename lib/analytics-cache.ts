import { getDb } from '@/lib/db';

export const ANALYTICS_DB_TTL_MS = 5 * 60_000;
export const ANALYTICS_RETENTION_DAYS = 90;

export interface AnalyticsDailyRow {
  layer: string;
  date: string;
  payments_sum: number;
  deals_sum: number;
  updated_at: string;
}

export const getAnalyticsDaily = (layer: string, startDate: string, endDate: string): AnalyticsDailyRow[] => {
  const db = getDb();
  return db
    .prepare(
      `
        SELECT layer, date, payments_sum, deals_sum, updated_at
        FROM analytics_daily
        WHERE layer = ? AND date BETWEEN ? AND ?
      `
    )
    .all(layer, startDate, endDate) as AnalyticsDailyRow[];
};

export const upsertAnalyticsDaily = (rows: Array<Pick<AnalyticsDailyRow, 'layer' | 'date' | 'payments_sum' | 'deals_sum' | 'updated_at'>>) => {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `
      INSERT INTO analytics_daily (layer, date, payments_sum, deals_sum, updated_at)
      VALUES (@layer, @date, @payments_sum, @deals_sum, @updated_at)
      ON CONFLICT(layer, date) DO UPDATE SET
        payments_sum = excluded.payments_sum,
        deals_sum = excluded.deals_sum,
        updated_at = excluded.updated_at
    `
  );
  const tx = db.transaction((batch: typeof rows) => {
    for (const row of batch) {
      stmt.run(row);
    }
  });
  tx(rows);
};

export const buildAnalyticsMap = (rows: AnalyticsDailyRow[]) => {
  const map = new Map<string, AnalyticsDailyRow>();
  rows.forEach((row) => {
    map.set(row.date, row);
  });
  return map;
};

export const isAnalyticsRowFresh = (row: AnalyticsDailyRow | undefined, now: number) => {
  if (!row?.updated_at) return false;
  const updated = Date.parse(row.updated_at);
  if (Number.isNaN(updated)) return false;
  return now - updated < ANALYTICS_DB_TTL_MS;
};

export const cleanupAnalyticsDaily = (cutoffDate: string) => {
  const db = getDb();
  db.prepare('DELETE FROM analytics_daily WHERE date < ?').run(cutoffDate);
};
