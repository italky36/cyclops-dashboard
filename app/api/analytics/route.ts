/**
 * API endpoint для получения данных аналитики (платежи vs сделки)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';
import { ANALYTICS_RETENTION_DAYS, buildAnalyticsMap, cleanupAnalyticsDaily, getAnalyticsDaily, isAnalyticsRowFresh, upsertAnalyticsDaily } from '@/lib/analytics-cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ANALYTICS_CACHE_TTL_MS = 60_000;
const ANALYTICS_CONCURRENCY_LIMIT = 5;
const ANALYTICS_DEALS_PAGE_SIZE = 500;
const analyticsCache = new Map<string, { timestamp: number; payload: unknown }>();

interface DataPoint {
  date: string;
  payments: number;
  deals: number;
}

type VirtualAccountRecord = {
  id?: string;
  virtual_account?: string;
  code?: string;
};

const extractVirtualAccountIds = (result: unknown): string[] => {
  if (!result || typeof result !== 'object') return [];
  const root = result as { virtual_accounts?: unknown[]; result?: unknown };
  const list = Array.isArray(root.virtual_accounts)
    ? root.virtual_accounts
    : Array.isArray(root.result)
      ? (root.result as unknown[])
      : [];

  return list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return null;
      const record = item as VirtualAccountRecord;
      return record.id || record.virtual_account || record.code || null;
    })
    .filter((id): id is string => Boolean(id));
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
};

export async function GET(request: NextRequest) {
  try {
    const layer = getLayerFromRequest(request);
    const cyclops = await getCyclopsClient(layer);

    // Получаем параметр периода (по умолчанию - 30 дней)
    const { searchParams } = new URL(request.url);
    const requestedDays = parseInt(searchParams.get('days') || '30', 10);
    const days = Number.isFinite(requestedDays) ? Math.max(1, Math.min(requestedDays, ANALYTICS_RETENTION_DAYS)) : 30;
    const cacheKey = `${layer}:${days}`;
    const cached = analyticsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ANALYTICS_CACHE_TTL_MS) {
      return NextResponse.json(cached.payload);
    }

    // Генерируем массив дат за последние N дней
    const today = new Date();
    const retentionCutoff = new Date(today);
    retentionCutoff.setDate(retentionCutoff.getDate() - (ANALYTICS_RETENTION_DAYS - 1));
    const retentionCutoffStr = retentionCutoff.toISOString().split('T')[0];
    cleanupAnalyticsDaily(retentionCutoffStr);
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }

    const now = Date.now();
    const [startDate, endDate] = [dates[0], dates[dates.length - 1]];
    const cachedRows = getAnalyticsDaily(layer, startDate, endDate);
    const cachedMap = buildAnalyticsMap(cachedRows);
    const missingDates = dates.filter((date) => !isAnalyticsRowFresh(cachedMap.get(date), now));

    let accounts: string[] = [];
    if (missingDates.length > 0) {
      const accountsResult = await cyclops.call('list_virtual_account', { page: 1, per_page: 1000 });
      accounts = extractVirtualAccountIds(accountsResult.result ?? accountsResult);
      console.log('Analytics API - accounts count:', accounts.length);
    }

    interface DealItem {
      created_at?: string;
      datetime?: string;
      amount?: number;
    }

    const parseDealDate = (dateStr: string): string | null => {
      if (dateStr.includes('T')) {
        return dateStr.split('T')[0];
      }
      if (dateStr.includes(',')) {
        const parts = dateStr.split(',')[0].trim().split('.');
        if (parts.length === 3) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
      return null;
    };

    if (missingDates.length > 0) {
      const paymentsByDate = new Map<string, number>();
      const dealsByDate = new Map<string, number>();

      for (const date of missingDates) {
        if (accounts.length === 0) {
          paymentsByDate.set(date, 0);
          continue;
        }

        const results = await mapWithConcurrency(
          accounts,
          ANALYTICS_CONCURRENCY_LIMIT,
          async (accountId) => {
            const response = await cyclops.call('list_virtual_transaction', {
              page: 1,
              per_page: 1,
              filters: {
                virtual_account: accountId,
                created_date_from: date,
                created_date_to: date,
              },
            });
            if (response.error) {
              console.warn('Analytics API - list_virtual_transaction error', response.error);
              return { total_receipts: 0, total_payouts: 0 };
            }
            const result = response.result as
              | { total_receipts?: number; total_payouts?: number }
              | undefined;
            return {
              total_receipts: result?.total_receipts || 0,
              total_payouts: result?.total_payouts || 0,
            };
          }
        );

        const dayReceipts = results.reduce((sum, item) => sum + (item.total_receipts || 0), 0);
        paymentsByDate.set(date, dayReceipts);
      }

      const missingRangeStart = missingDates[0];
      const missingRangeEnd = missingDates[missingDates.length - 1];
      let page = 1;
      while (true) {
        const dealsResponse = await cyclops.call('list_deals', {
          page,
          per_page: ANALYTICS_DEALS_PAGE_SIZE,
          filters: {
            created_date_from: missingRangeStart,
            created_date_to: missingRangeEnd,
          },
        });
        if (dealsResponse.error) {
          console.warn('Analytics API - list_deals error', dealsResponse.error);
          break;
        }
        const dealsData = (dealsResponse.result as { deals?: unknown[] } | undefined)?.deals || dealsResponse.result || [];
        const deals = Array.isArray(dealsData) ? (dealsData as DealItem[]) : [];

        deals.forEach((deal) => {
          const dateStr = deal.created_at || deal.datetime;
          const amountValue = deal.amount || 0;
          if (!dateStr) return;
          const date = parseDealDate(dateStr);
          if (!date) return;
          dealsByDate.set(date, (dealsByDate.get(date) || 0) + amountValue);
        });

        if (deals.length < ANALYTICS_DEALS_PAGE_SIZE) {
          break;
        }
        page += 1;
      }

      const nowIso = new Date().toISOString();
      const rowsToUpsert = missingDates.map((date) => ({
        layer,
        date,
        payments_sum: paymentsByDate.get(date) || 0,
        deals_sum: dealsByDate.get(date) || 0,
        updated_at: nowIso,
      }));

      upsertAnalyticsDaily(rowsToUpsert);
      rowsToUpsert.forEach((row) => {
        cachedMap.set(row.date, {
          layer: row.layer,
          date: row.date,
          payments_sum: row.payments_sum,
          deals_sum: row.deals_sum,
          updated_at: row.updated_at,
        });
      });
    }

    // Преобразуем в массив для графика
    const data: DataPoint[] = dates.map(date => ({
      date,
      payments: cachedMap.get(date)?.payments_sum || 0,
      deals: cachedMap.get(date)?.deals_sum || 0,
    }));

    // Логируем итоговые данные
    console.log('Analytics API - final data points:', data.length);
    const totalPayments = data.reduce((sum, d) => sum + d.payments, 0);
    const totalDeals = data.reduce((sum, d) => sum + d.deals, 0);
    console.log('Analytics API - total receipts:', totalPayments);
    console.log('Analytics API - total deals:', totalDeals);

    const payload = {
      success: true,
      data,
      period: {
        days,
        start: dates[0],
        end: dates[dates.length - 1],
      },
      debug: {
        accountsCount: accounts.length,
        cachedDays: cachedRows.length,
        missingDays: missingDates.length,
        totalReceipts: totalPayments,
        totalDeals,
      },
    };

    analyticsCache.set(cacheKey, { timestamp: Date.now(), payload });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      },
      { status: 500 }
    );
  }
}
