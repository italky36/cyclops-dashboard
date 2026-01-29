'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { PaymentDetail, PaymentFilters } from '@/types/cyclops';
import { normalizePaymentRecord } from '@/lib/cyclops-payments';
import { PaymentFilters as PaymentFiltersComponent } from './components/PaymentFilters';
import { RateLimitBadge, RefreshButton } from './components/RateLimitBadge';

const parseBooleanParam = (value: string | null): boolean | undefined => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

const parseNumberParam = (value: string | null, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFilterDateTime = (value?: string): Date | null => {
  if (!value) return null;
  let normalized = value;
  if (normalized.includes(' ') && !normalized.includes('T')) {
    normalized = normalized.replace(' ', 'T');
  }
  if (/[+-]\d{2}$/.test(normalized)) {
    normalized = `${normalized}:00`;
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseFilterDateOnly = (value?: string): { year: number; month: number; day: number } | null => {
  if (!value) return null;
  const parts = value.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
};

const isSameDate = (date: Date, target: { year: number; month: number; day: number }) =>
  date.getFullYear() === target.year &&
  date.getMonth() + 1 === target.month &&
  date.getDate() === target.day;

const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const parseFiltersFromQuery = (params: URLSearchParams) => {
  const filters: PaymentFilters = {};
  const incoming = parseBooleanParam(params.get('incoming'));
  if (incoming !== undefined) {
    filters.incoming = incoming;
  }
  const account = params.get('account');
  if (account) {
    filters.account = account;
  }
  const bic = params.get('bic');
  if (bic) {
    filters.bic = bic;
  }

  return {
    filters,
    page: parseNumberParam(params.get('page'), 1),
    perPage: parseNumberParam(params.get('per_page'), 100),
    tenderSource: params.get('tender') === '1' || params.get('source') === 'tender-helpers',
    autoFind: params.get('auto_find') === '1' || params.get('auto_find') === 'true',
  };
};

export default function PaymentsPage() {
  const layer = useAppStore((s) => s.layer);
  const {
    listPayments,
  } = useCyclops({ layer });
  const searchParams = useSearchParams();

  const initialQueryRef = useRef<ReturnType<typeof parseFiltersFromQuery> | null>(null);
  if (!initialQueryRef.current) {
    initialQueryRef.current = parseFiltersFromQuery(searchParams);
  }
  const initialQuery = initialQueryRef.current;

  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters and pagination
  const [filters, setFilters] = useState<PaymentFilters>(initialQuery.filters);
  const [page, setPage] = useState(initialQuery.page);
  const [perPage, setPerPage] = useState(initialQuery.perPage);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  // Cache info
  const [listCacheInfo, setListCacheInfo] = useState<{
    cached?: boolean;
    nextAllowedAt?: string;
    cacheAgeSeconds?: number;
  }>({});

  const [tenderSource, setTenderSource] = useState(initialQuery.tenderSource);
  const [autoFindEnabled, setAutoFindEnabled] = useState(initialQuery.autoFind);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      let forcedTotal: number | null = null;
      let forcedPage: number | null = null;
      const localAccount = filters.account?.trim();
      const localBic = filters.bic?.trim();
      const localCreateDate = parseFilterDateOnly(filters.create_date);
      const localUpdatedFrom = parseFilterDateTime(filters.updated_at_from);
      const localUpdatedTo = parseFilterDateTime(filters.updated_at_to);
      const hasLocalFilters =
        typeof filters.incoming === 'boolean' ||
        Boolean(localAccount) ||
        Boolean(localBic) ||
        Boolean(localCreateDate) ||
        Boolean(localUpdatedFrom) ||
        Boolean(localUpdatedTo);
      const requestFilters: PaymentFilters = { ...filters };
      delete requestFilters.incoming;
      delete requestFilters.account;
      delete requestFilters.bic;
      delete requestFilters.create_date;
      delete requestFilters.updated_at_from;
      delete requestFilters.updated_at_to;
      const paymentsRes = await listPayments({
        page,
        per_page: perPage,
        filters: Object.keys(requestFilters).length ? requestFilters : undefined,
      });

      // Extract payments from response
      const paymentsData =
        paymentsRes.result?.payments ||
        (paymentsRes as { data?: { payments?: PaymentDetail[] } }).data?.payments ||
        (paymentsRes.result as { data?: { payments?: PaymentDetail[] } } | undefined)?.data?.payments ||
        paymentsRes.result ||
        (paymentsRes as { data?: PaymentDetail[] }).data ||
        [];
      if (Array.isArray(paymentsData)) {
        const normalized = paymentsData
          .map((item) => normalizePaymentRecord(item as Record<string, unknown>))
          .filter((item): item is PaymentDetail => Boolean(item));
        const shouldFilterIncoming = typeof filters.incoming === 'boolean';
        const filtered = normalized.filter((item) => {
          if (shouldFilterIncoming && item.incoming !== filters.incoming) {
            return false;
          }

          if (localAccount) {
            const payerAccount = item.payer_account || '';
            const recipientAccount = item.recipient_account || '';
            if (!payerAccount.includes(localAccount) && !recipientAccount.includes(localAccount)) {
              return false;
            }
          }

          if (localBic) {
            const payerBic = item.payer_bank_code || '';
            const recipientBic = item.recipient_bank_code || '';
            if (!payerBic.includes(localBic) && !recipientBic.includes(localBic)) {
              return false;
            }
          }

          if (localCreateDate) {
            const dateValue = item.first_seen_at || item.last_seen_at;
            if (!dateValue) return false;
            const date = new Date(dateValue);
            if (Number.isNaN(date.getTime())) return false;
            if (!isSameDate(date, localCreateDate)) {
              return false;
            }
          }

          if (localUpdatedFrom || localUpdatedTo) {
            const dateValue = item.last_seen_at || item.first_seen_at;
            if (!dateValue) return false;
            const date = new Date(dateValue);
            if (Number.isNaN(date.getTime())) return false;
            if (localUpdatedFrom && date < localUpdatedFrom) {
              return false;
            }
            if (localUpdatedTo && date > localUpdatedTo) {
              return false;
            }
          }

          return true;
        });
        setPayments(filtered);
        if (hasLocalFilters) {
          forcedTotal = filtered.length;
          forcedPage = 1;
        }
      }

      // Extract meta
      const meta =
        paymentsRes.result?.meta ||
        (paymentsRes as { data?: { meta?: Record<string, unknown> } }).data?.meta ||
        (paymentsRes.result as { data?: { meta?: Record<string, unknown> } } | undefined)?.data?.meta;
      if (meta) {
        const typedMeta = meta as { total?: number; page?: { current_page?: number } };
        if (forcedTotal !== null) {
          setTotal(forcedTotal);
          setCurrentPage(forcedPage ?? 1);
        } else {
          setTotal(typeof typedMeta.total === 'number' ? typedMeta.total : 0);
          setCurrentPage(
            typeof typedMeta.page?.current_page === 'number'
              ? typedMeta.page.current_page
              : page
          );
        }
      } else if (forcedTotal !== null) {
        setTotal(forcedTotal);
        setCurrentPage(forcedPage ?? 1);
      }

      // Cache info
      const cache = (paymentsRes as { _cache?: typeof listCacheInfo })._cache;
      if (cache) {
        setListCacheInfo(cache);
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      console.error('Failed to load payments:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filters, page, perPage, listPayments]);

  useEffect(() => {
    const parsed = parseFiltersFromQuery(searchParams);
    setFilters(parsed.filters);
    setPage(parsed.page);
    setPerPage(parsed.perPage);
    setTenderSource(parsed.tenderSource);
    setAutoFindEnabled(parsed.autoFind);
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoFindEnabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (isLoading || isRefreshing) {
        return;
      }

      const nextAllowedAt = listCacheInfo.nextAllowedAt
        ? new Date(listCacheInfo.nextAllowedAt).getTime()
        : null;

      if (listCacheInfo.cached && nextAllowedAt && nextAllowedAt > Date.now()) {
        return;
      }

      loadData(true);
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [autoFindEnabled, isLoading, isRefreshing, listCacheInfo.cached, listCacheInfo.nextAllowedAt, loadData]);

  const handleRefresh = () => {
    loadData(true);
  };

  const handleFiltersChange = (newFilters: PaymentFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleFiltersReset = () => {
    setFilters({});
    setPage(1);
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1);
  };

  const totalPages = Math.ceil(total / perPage);

  const copyText = async (value: string, key: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1200);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  return (
    <div className="payments-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Платежи</h1>
          <p className="page-description">
            Входящие и исходящие платежи по номинальному счёту
          </p>
        </div>
        <div className="header-actions">
          <RefreshButton
            onClick={handleRefresh}
            isLoading={isRefreshing}
            nextAllowedAt={listCacheInfo.nextAllowedAt}
            cached={listCacheInfo.cached}
          />
        </div>
      </header>

      {tenderSource && (
        <div className="tender-filter-badge">
          Фильтр установлен из Tender-Helpers: account={filters.account || '—'}, bic={filters.bic || '—'}
        </div>
      )}

      {autoFindEnabled && (
        <div className="auto-find-banner">
          <div>
            <strong>Автопоиск платежа включён.</strong>
            <span>Проверяем список каждые 10–15 секунд с учётом кеша.</span>
          </div>
          <RateLimitBadge
            cached={listCacheInfo.cached}
            nextAllowedAt={listCacheInfo.nextAllowedAt}
            cacheAgeSeconds={listCacheInfo.cacheAgeSeconds}
            compact
          />
        </div>
      )}

      {/* Filters */}
      <PaymentFiltersComponent
        filters={filters}
        onChange={handleFiltersChange}
        onReset={handleFiltersReset}
        isLoading={isLoading || isRefreshing}
      />

      {/* Per page selector */}
      <div className="pagination-header">
        <div className="per-page-selector">
          <span>Показывать по:</span>
          <select
            value={perPage}
            onChange={(e) => handlePerPageChange(Number(e.target.value))}
            disabled={isLoading}
          >
            {[25, 50, 100, 500, 1000].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        {listCacheInfo.cached && (
          <RateLimitBadge
            cached={listCacheInfo.cached}
            nextAllowedAt={listCacheInfo.nextAllowedAt}
            cacheAgeSeconds={listCacheInfo.cacheAgeSeconds}
            compact
          />
        )}

        {total > 0 && (
          <div className="total-info">
            Всего: {total} платежей
          </div>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Загрузка платежей...</span>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="error-state-title">Не удалось получить список платежей</p>
            <p className="error-state-description">{error}</p>
            <div className="error-actions">
              <button className="btn btn-primary" onClick={handleRefresh}>
                Повторить
              </button>
              <button className="btn btn-secondary" onClick={handleFiltersReset}>
                Сбросить фильтры
              </button>
            </div>
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <p className="empty-state-title">
              Платежи не найдены
            </p>
            <p className="empty-state-description">
              Попробуйте изменить фильтры или дождитесь поступления платежей.
            </p>
            {Object.keys(filters).length > 0 && (
              <button className="btn btn-secondary" onClick={handleFiltersReset}>
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <>
            {isRefreshing && (
              <div className="refresh-overlay">
                <span>Обновляем...</span>
              </div>
            )}
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Дата и время</th>
                    <th>Входящий</th>
                    <th>Счёт отправителя</th>
                    <th>БИК</th>
                    <th>Счёт получателя</th>
                    <th>БИК</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => {
                    const paymentId = payment.payment_id || '';
                    const isIncoming = typeof payment.incoming === 'boolean' ? payment.incoming : false;
                    const paymentKey = paymentId || `row-${index}`;
                    const firstSeenAt =
                      typeof payment.first_seen_at === 'string'
                        ? payment.first_seen_at
                        : typeof payment.last_seen_at === 'string'
                          ? payment.last_seen_at
                          : null;

                    return (
                      <tr key={paymentKey}>
                        <td className="id-cell">
                          {paymentId ? (
                            <div className="cell-with-copy">
                              <Link
                                href={`/payments/${paymentId}`}
                                className="payment-id-link cell-value"
                                title={paymentId}
                              >
                                {paymentId}
                              </Link>
                              <button
                                type="button"
                                className={`copy-btn ${copiedKey === `id:${paymentId}` ? 'copied' : ''}`}
                                title="Скопировать ID"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  copyText(paymentId, `id:${paymentId}`);
                                }}
                              >
                                ⧉
                              </button>
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{formatDateTime(firstSeenAt)}</td>
                        <td>
                          {isIncoming ? (
                            <span className="badge badge-success">Да</span>
                          ) : (
                            <span className="badge badge-neutral">Нет</span>
                          )}
                        </td>
                        <td className="account-cell">
                          {payment.payer_account ? (
                            <span
                              className={`cell-value copyable ${copiedKey === `payer:${paymentId}` ? 'copied' : ''}`}
                              title="Нажмите чтобы скопировать"
                              onClick={() => copyText(payment.payer_account as string, `payer:${paymentId}`)}
                            >
                              {payment.payer_account}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="bic-cell">
                          {payment.payer_bank_code ? (
                            <span
                              className={`cell-value copyable ${copiedKey === `payerbic:${paymentId}` ? 'copied' : ''}`}
                              title="Нажмите чтобы скопировать"
                              onClick={() => copyText(payment.payer_bank_code as string, `payerbic:${paymentId}`)}
                            >
                              {payment.payer_bank_code}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="account-cell">
                          {payment.recipient_account ? (
                            <span
                              className={`cell-value copyable ${copiedKey === `rec:${paymentId}` ? 'copied' : ''}`}
                              title="Нажмите чтобы скопировать"
                              onClick={() => copyText(payment.recipient_account as string, `rec:${paymentId}`)}
                            >
                              {payment.recipient_account}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="bic-cell">
                          {payment.recipient_bank_code ? (
                            <span
                              className={`cell-value copyable ${copiedKey === `recbic:${paymentId}` ? 'copied' : ''}`}
                              title="Нажмите чтобы скопировать"
                              onClick={() => copyText(payment.recipient_bank_code as string, `recbic:${paymentId}`)}
                            >
                              {payment.recipient_bank_code}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setPage(1)}
                  disabled={page === 1 || isLoading}
                >
                  &laquo;
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1 || isLoading}
                >
                  &lsaquo;
                </button>
                <span className="page-info">
                  Страница {currentPage} из {totalPages}
                </span>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages || isLoading}
                >
                  &rsaquo;
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || isLoading}
                >
                  &raquo;
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .payments-page {
          max-width: 1600px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tender-filter-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(16, 185, 129, 0.12);
          color: var(--color-success);
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 16px;
          border: 1px solid rgba(16, 185, 129, 0.25);
          flex-wrap: wrap;
        }

        .auto-find-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border: 1px dashed var(--border-color);
          border-radius: 12px;
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .auto-find-banner strong {
          display: block;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .pagination-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .per-page-selector {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .per-page-selector select {
          padding: 6px 10px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 6px;
          color: var(--text-primary);
        }

        .total-info {
          margin-left: auto;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          text-align: center;
        }

        .error-state-icon {
          color: var(--color-error, #ef4444);
          margin-bottom: 16px;
        }

        .error-state-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .error-state-description {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0 0 16px 0;
          max-width: 500px;
        }

        .error-actions {
          display: flex;
          gap: 12px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          text-align: center;
        }

        .empty-state-icon {
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .empty-state-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .empty-state-description {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0 0 16px 0;
          max-width: 400px;
        }

        .refresh-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: 8px;
          background: var(--color-primary);
          color: white;
          text-align: center;
          font-size: 14px;
          z-index: 10;
        }

        .table-wrapper {
          position: relative;
          overflow-x: auto;
        }

        .id-cell {
          min-width: 220px;
        }

        .cell-with-copy {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .payment-id-link {
          font-family: monospace;
          font-size: 13px;
          color: var(--color-primary);
          text-decoration: none;
        }

        .payment-id-link:hover {
          text-decoration: underline;
        }

        .type-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }

        .type-badge.incoming {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .type-badge.outgoing {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .account-cell,
        .bic-cell {
          font-family: monospace;
          font-size: 12px;
        }

        .cell-value {
          word-break: break-all;
          white-space: normal;
        }

        .copyable {
          cursor: pointer;
          transition: color 0.2s ease;
        }

        .copyable:hover {
          color: var(--color-primary);
        }

        .copied {
          color: var(--color-success);
        }

        .copy-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 12px;
          padding: 2px 4px;
          border-radius: 4px;
        }

        .copy-btn:hover {
          color: var(--color-primary);
          background: var(--bg-tertiary);
        }

        .pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px;
          border-top: 1px solid var(--border-color);
        }

        .page-info {
          padding: 0 12px;
          font-size: 14px;
          color: var(--text-secondary);
        }

        @media (max-width: 1200px) {
          .table th:nth-child(5),
          .table td:nth-child(5),
          .table th:nth-child(6),
          .table td:nth-child(6),
          .table th:nth-child(7),
          .table td:nth-child(7) {
            display: none;
          }

          .cell-value {
            display: inline-block;
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            word-break: normal;
          }
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
          }

          .header-actions {
            flex-wrap: wrap;
          }

          .pending-badge {
            order: 2;
            flex: 1 1 100%;
          }

          .auto-find-banner {
            flex-direction: column;
            align-items: flex-start;
          }

          .pagination-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .total-info {
            margin-left: 0;
          }

          :global(.table thead) {
            display: none;
          }

          :global(.table tbody tr) {
            display: flex;
            flex-direction: column;
            padding: 16px;
            margin-bottom: 8px;
            background: var(--bg-secondary);
            border-radius: 12px;
            gap: 8px;
          }

          :global(.table td) {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            border-bottom: none;
          }

          :global(.table td:before) {
            content: attr(data-label);
            font-weight: 500;
            color: var(--text-secondary);
            font-size: 12px;
          }

          :global(.table td:last-child) {
            padding-top: 12px;
            margin-top: 8px;
            border-top: 1px solid var(--border-color);
          }

          :global(.table td:last-child .btn) {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
