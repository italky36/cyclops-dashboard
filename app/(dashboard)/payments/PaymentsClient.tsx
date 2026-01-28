'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { PaymentDetail, PaymentFilters, IdentifyPaymentResult } from '@/types/cyclops';
import { canIdentifyPaymentType } from '@/lib/cyclops-validators';
import { PaymentFilters as PaymentFiltersComponent } from './components/PaymentFilters';
import { RateLimitBadge, RefreshButton } from './components/RateLimitBadge';
import { IdentifyModal } from './components/IdentifyModal';

interface VirtualAccountOption {
  virtual_account_id: string;
  beneficiary_inn?: string;
  type?: string;
}

const TYPE_LABELS: Record<string, string> = {
  incoming: 'Входящий',
  incoming_sbp: 'Входящий СБП',
  incoming_by_sbp_v2: 'СБП v2',
  incoming_unrecognized: 'Нераспознан',
  unrecognized_refund: 'Возврат нер.',
  unrecognized_refund_sbp: 'Возврат СБП',
  payment_contract: 'По реквизитам',
  payment_contract_by_sbp_v2: 'СБП v2',
  payment_contract_to_card: 'На карту',
  commission: 'Комиссия',
  ndfl: 'НДФЛ',
  refund: 'Возврат',
  card: 'Карта',
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  new: { label: 'Новый', class: 'badge-neutral' },
  in_process: { label: 'В обработке', class: 'badge-warning' },
  executed: { label: 'Исполнен', class: 'badge-success' },
  rejected: { label: 'Отклонён', class: 'badge-error' },
  returned: { label: 'Возвращён', class: 'badge-error' },
};

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

const parseFiltersFromQuery = (params: URLSearchParams) => {
  const filters: PaymentFilters = {};
  const incoming = parseBooleanParam(params.get('incoming'));
  if (incoming !== undefined) {
    filters.incoming = incoming;
  }
  const identify = parseBooleanParam(params.get('identify'));
  if (identify !== undefined) {
    filters.identify = identify;
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
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const {
    listPayments,
    listVirtualAccounts,
    getPayment,
    identifyPayment: identifyPaymentAction,
  } = useCyclops({ layer });
  const searchParams = useSearchParams();

  const initialQueryRef = useRef<ReturnType<typeof parseFiltersFromQuery> | null>(null);
  if (!initialQueryRef.current) {
    initialQueryRef.current = parseFiltersFromQuery(searchParams);
  }
  const initialQuery = initialQueryRef.current;

  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountOption[]>([]);
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

  // Identify modal
  const [identifyPayment, setIdentifyPayment] = useState<PaymentDetail | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [paymentsRes, accountsRes] = await Promise.all([
        listPayments({ page, per_page: perPage, filters }),
        listVirtualAccounts({ filters: { beneficiary: { is_active: true } } }),
      ]);

      // Extract payments from response
      const paymentsData = paymentsRes.result?.payments || paymentsRes.result || [];
      if (Array.isArray(paymentsData)) {
        const normalized = paymentsData.map((item) => {
          const entry = (item as { payment?: PaymentDetail })?.payment || item;
          const paymentEntry = entry as PaymentDetail & { id?: string };
          if (!paymentEntry.payment_id && paymentEntry.id) {
            return { ...paymentEntry, payment_id: String(paymentEntry.id) };
          }
          return paymentEntry;
        });
        setPayments(normalized);
      }

      // Extract meta
      const meta = paymentsRes.result?.meta;
      if (meta) {
        setTotal(meta.total || 0);
        setCurrentPage(meta.page?.current_page || page);
      }

      // Cache info
      const cache = (paymentsRes as { _cache?: typeof listCacheInfo })._cache;
      if (cache) {
        setListCacheInfo(cache);
      }

      // Virtual accounts
      const accountIds = accountsRes.result?.virtual_accounts;
      if (Array.isArray(accountIds)) {
        setVirtualAccounts(accountIds.map((id: string) => ({ virtual_account_id: id })));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      console.error('Failed to load payments:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [filters, page, perPage, listPayments, listVirtualAccounts]);

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

  const handleIdentifySubmit = async (params: {
    payment_id: string;
    is_returned_payment?: boolean;
    owners: Array<{ virtual_account: string; amount: number }>;
  }): Promise<IdentifyPaymentResult | null> => {
    setIsIdentifying(true);
    try {
      const response = await identifyPaymentAction(params);

      addRecentAction({
        type: 'Идентификация',
        description: `Платёж ${params.payment_id.slice(0, 8)}... идентифицирован`,
        layer,
      });

      return response.result || null;
    } catch (err) {
      throw err;
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleIdentifySuccess = () => {
    setIdentifyPayment(null);
    loadData(true);
  };

  const handleIdentifyOpen = async (payment: PaymentDetail) => {
    if (!payment.payment_id) {
      return;
    }

    if (typeof payment.amount === 'number' && Number.isFinite(payment.amount)) {
      setIdentifyPayment(payment);
      return;
    }

    try {
      const detail = await getPayment(payment.payment_id);
      const detailPayment = detail.result?.payment || detail.result;
      if (detailPayment) {
        setIdentifyPayment(detailPayment as PaymentDetail);
      } else {
        setIdentifyPayment(payment);
      }
    } catch (err) {
      console.error('Failed to load payment detail:', err);
      setIdentifyPayment(payment);
    }
  };

  const unidentifiedCount = payments.filter(
    (p) => p.incoming && !p.identify
  ).length;

  const totalPages = Math.ceil(total / perPage);

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
          {unidentifiedCount > 0 && (
            <div className="pending-badge">
              {unidentifiedCount} ожидают идентификации
            </div>
          )}
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
          Фильтр установлен из Tender-Helpers: identify=false, account={filters.account || '—'}, bic={filters.bic || '—'}
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
              {filters.identify === false
                ? 'Неидентифицированных платежей нет'
                : 'Платежи не найдены'}
            </p>
            <p className="empty-state-description">
              {filters.identify === false
                ? 'Все входящие платежи идентифицированы. Новые платежи появляются с задержкой 10-30 секунд.'
                : 'Попробуйте изменить фильтры или дождитесь поступления платежей.'}
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
                    <th>Тип</th>
                    <th>Статус</th>
                    <th>Входящий</th>
                    <th>Идентиф.</th>
                    <th>Счёт платильщика</th>
                    <th>БИК</th>
                    <th>Счёт получателя</th>
                    <th>БИК</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => {
                    const status = STATUS_LABELS[payment.status] || { label: payment.status, class: 'badge-neutral' };
                    const isIncoming = payment.incoming;
                    const canIdentify = isIncoming && !payment.identify && canIdentifyPaymentType(payment.type) && Boolean(payment.payment_id);
                    const paymentId = payment.payment_id || '';
                    const paymentKey = paymentId || `row-${index}`;

                    return (
                      <tr key={paymentKey}>
                        <td>
                          {paymentId ? (
                            <Link
                              href={`/payments/${paymentId}`}
                              className="payment-id-link"
                            >
                              {paymentId.slice(0, 8)}...
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <span className={`type-badge ${isIncoming ? 'incoming' : 'outgoing'}`}>
                            {isIncoming ? '\u2193' : '\u2191'} {TYPE_LABELS[payment.type] || payment.type}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${status.class}`}>
                            {status.label}
                          </span>
                        </td>
                        <td>
                          {isIncoming ? (
                            <span className="badge badge-success">Да</span>
                          ) : (
                            <span className="badge badge-neutral">Нет</span>
                          )}
                        </td>
                        <td>
                          {isIncoming ? (
                            payment.identify ? (
                              <span className="badge badge-success">Да</span>
                            ) : (
                              <span className="badge badge-warning">Нет</span>
                            )
                          ) : (
                            <span className="badge badge-neutral">-</span>
                          )}
                        </td>
                        <td className="account-cell">
                          {payment.payer_account ? (
                            <span title={payment.payer_account}>
                              {payment.payer_account.slice(0, 8)}...
                            </span>
                          ) : '-'}
                        </td>
                        <td className="bic-cell">
                          {payment.payer_bank_code || '-'}
                        </td>
                        <td className="account-cell">
                          {payment.recipient_account ? (
                            <span title={payment.recipient_account}>
                              {payment.recipient_account.slice(0, 8)}...
                            </span>
                          ) : '-'}
                        </td>
                        <td className="bic-cell">
                          {payment.recipient_bank_code || '-'}
                        </td>
                        <td>
                          {canIdentify && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleIdentifyOpen(payment)}
                            >
                              Идентифицировать
                            </button>
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

      {/* Identify Modal */}
      {identifyPayment && (
        <IdentifyModal
          payment={identifyPayment}
          virtualAccounts={virtualAccounts}
          isSubmitting={isIdentifying}
          onSubmit={handleIdentifySubmit}
          onClose={() => setIdentifyPayment(null)}
          onSuccess={handleIdentifySuccess}
        />
      )}

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

        .pending-badge {
          padding: 8px 16px;
          background: var(--color-warning-bg);
          color: var(--color-warning);
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
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
          .table th:nth-child(6),
          .table td:nth-child(6),
          .table th:nth-child(7),
          .table td:nth-child(7),
          .table th:nth-child(8),
          .table td:nth-child(8),
          .table th:nth-child(9),
          .table td:nth-child(9) {
            display: none;
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
