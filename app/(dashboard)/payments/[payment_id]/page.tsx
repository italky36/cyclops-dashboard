'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { PaymentDetail, IdentifyPaymentResult } from '@/types/cyclops';
import { canIdentifyPaymentType } from '@/lib/cyclops-validators';
import { RateLimitBadge, RefreshButton } from '../components/RateLimitBadge';
import { IdentifyModal } from '../components/IdentifyModal';

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

// Known fields that we render explicitly
const KNOWN_FIELDS = new Set([
  'payment_id', 'type', 'status', 'amount', 'incoming', 'identify',
  'created_at', 'updated_at', 'purpose', 'document_number', 'document_date',
  'payer_bank_code', 'payer_account', 'payer_name', 'payer_tax_code',
  'payer_tax_reason_code', 'payer_bank_name', 'payer_correspondent_account',
  'recipient_bank_code', 'recipient_account', 'recipient_name', 'recipient_tax_code',
  'recipient_tax_reason_code', 'recipient_bank_name', 'recipient_correspondent_account',
  'cancel_reason_description', 'deal_id', 'virtual_accounts',
]);

export default function PaymentDetailPage() {
  const params = useParams();
  const paymentId = params.payment_id as string;

  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const { getPayment, listVirtualAccounts, identifyPayment: identifyPaymentAction } = useCyclops({ layer });

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Cache info
  const [detailCacheInfo, setDetailCacheInfo] = useState<{
    cached?: boolean;
    nextAllowedAt?: string;
    cacheAgeSeconds?: number;
  }>({});

  // Identify modal
  const [showIdentifyModal, setShowIdentifyModal] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    setNotFound(false);

    try {
      const [paymentRes, accountsRes] = await Promise.all([
        getPayment(paymentId),
        listVirtualAccounts({ filters: { beneficiary: { is_active: true } } }),
      ]);

      const paymentData = paymentRes.result?.payment || paymentRes.result;
      if (!paymentData) {
        setNotFound(true);
        return;
      }

      setPayment(paymentData as PaymentDetail);

      // Cache info
      const cache = (paymentRes as { _cache?: typeof detailCacheInfo })._cache;
      if (cache) {
        setDetailCacheInfo(cache);
      }

      // Virtual accounts
      const accountIds = accountsRes.result?.virtual_accounts;
      if (Array.isArray(accountIds)) {
        setVirtualAccounts(accountIds.map((id: string) => ({ virtual_account_id: id })));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      if (message.includes('не найден') || message.includes('not found')) {
        setNotFound(true);
      } else {
        setError(message);
      }
      console.error('Failed to load payment:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [paymentId, getPayment, listVirtualAccounts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
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
    setShowIdentifyModal(false);
    loadData(true);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get additional fields that are not in KNOWN_FIELDS
  const getAdditionalFields = () => {
    if (!payment) return [];
    return Object.entries(payment).filter(
      ([key, value]) => !KNOWN_FIELDS.has(key) && value !== undefined && value !== null && value !== ''
    );
  };

  const canIdentify = payment && payment.incoming && !payment.identify && canIdentifyPaymentType(payment.type);

  // Loading state
  if (isLoading) {
    return (
      <div className="payment-detail-page">
        <div className="loading-state">
          <div className="spinner" />
          <span>Загрузка платежа...</span>
        </div>
        <style jsx>{`
          .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 100px;
            color: var(--text-secondary);
          }
        `}</style>
      </div>
    );
  }

  // Not found state
  if (notFound) {
    return (
      <div className="payment-detail-page">
        <div className="not-found-state">
          <div className="not-found-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h2>Платёж не найден</h2>
          <p>Платёж с ID {paymentId} не существует или был удалён.</p>
          <Link href="/payments" className="btn btn-primary">
            Назад к списку
          </Link>
        </div>
        <style jsx>{`
          .not-found-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 100px 24px;
            text-align: center;
          }

          .not-found-icon {
            color: var(--text-secondary);
            margin-bottom: 24px;
          }

          .not-found-state h2 {
            margin: 0 0 8px 0;
            font-size: 24px;
          }

          .not-found-state p {
            margin: 0 0 24px 0;
            color: var(--text-secondary);
          }
        `}</style>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="payment-detail-page">
        <div className="error-state">
          <div className="error-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Не удалось загрузить детали</h2>
          <p>{error}</p>
          <div className="error-actions">
            <button className="btn btn-primary" onClick={handleRefresh}>
              Повторить
            </button>
            <Link href="/payments" className="btn btn-secondary">
              Назад к списку
            </Link>
          </div>
        </div>
        <style jsx>{`
          .error-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 100px 24px;
            text-align: center;
          }

          .error-icon {
            color: var(--color-error);
            margin-bottom: 16px;
          }

          .error-state h2 {
            margin: 0 0 8px 0;
            font-size: 20px;
          }

          .error-state p {
            margin: 0 0 24px 0;
            color: var(--text-secondary);
          }

          .error-actions {
            display: flex;
            gap: 12px;
          }
        `}</style>
      </div>
    );
  }

  if (!payment) return null;

  const status = STATUS_LABELS[payment.status] || { label: payment.status, class: 'badge-neutral' };
  const additionalFields = getAdditionalFields();

  return (
    <div className="payment-detail-page">
      {/* Header */}
      <header className="page-header">
        <div className="header-left">
          <Link href="/payments" className="back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Назад к списку
          </Link>
          <h1 className="page-title">Платёж {payment.payment_id.slice(0, 8)}...</h1>
        </div>
        <div className="header-actions">
          {detailCacheInfo.cached && (
            <RateLimitBadge
              cached={detailCacheInfo.cached}
              nextAllowedAt={detailCacheInfo.nextAllowedAt}
              cacheAgeSeconds={detailCacheInfo.cacheAgeSeconds}
              compact
            />
          )}
          <RefreshButton
            onClick={handleRefresh}
            isLoading={isRefreshing}
            nextAllowedAt={detailCacheInfo.nextAllowedAt}
            cached={detailCacheInfo.cached}
          />
        </div>
      </header>

      <div className="cards-grid">
        {/* Summary Card */}
        <div className="card">
          <h3 className="card-title">Основная информация</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">ID</span>
              <span className="info-value mono">{payment.payment_id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Тип</span>
              <span className={`type-badge ${payment.incoming ? 'incoming' : 'outgoing'}`}>
                {payment.incoming ? '\u2193' : '\u2191'} {TYPE_LABELS[payment.type] || payment.type}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Статус</span>
              <span className={`badge ${status.class}`}>{status.label}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Сумма</span>
              <span className={`info-value money ${payment.incoming ? 'positive' : ''}`}>
                {payment.incoming ? '+' : ''}{formatMoney(payment.amount)}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Входящий</span>
              <span className={`badge ${payment.incoming ? 'badge-success' : 'badge-neutral'}`}>
                {payment.incoming ? 'Да' : 'Нет'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Идентифицирован</span>
              {payment.incoming ? (
                <span className={`badge ${payment.identify ? 'badge-success' : 'badge-warning'}`}>
                  {payment.identify ? 'Да' : 'Нет'}
                </span>
              ) : (
                <span className="badge badge-neutral">-</span>
              )}
            </div>
          </div>
        </div>

        {/* Document Card */}
        {(payment.purpose || payment.document_number || payment.document_date) && (
          <div className="card">
            <h3 className="card-title">Документ</h3>
            <div className="info-grid">
              {payment.purpose && (
                <div className="info-item full-width">
                  <span className="info-label">Назначение</span>
                  <span className="info-value purpose">{payment.purpose}</span>
                </div>
              )}
              {payment.document_number && (
                <div className="info-item">
                  <span className="info-label">Номер документа</span>
                  <span className="info-value">{payment.document_number}</span>
                </div>
              )}
              {payment.document_date && (
                <div className="info-item">
                  <span className="info-label">Дата документа</span>
                  <span className="info-value">{payment.document_date}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payer Card */}
        {(payment.payer_account || payment.payer_name) && (
          <div className="card">
            <h3 className="card-title">Плательщик</h3>
            <div className="info-grid">
              {payment.payer_name && (
                <div className="info-item full-width">
                  <span className="info-label">Наименование</span>
                  <span className="info-value">{payment.payer_name}</span>
                </div>
              )}
              {payment.payer_account && (
                <div className="info-item">
                  <span className="info-label">Счёт</span>
                  <span className="info-value mono">{payment.payer_account}</span>
                </div>
              )}
              {payment.payer_bank_code && (
                <div className="info-item">
                  <span className="info-label">БИК</span>
                  <span className="info-value mono">{payment.payer_bank_code}</span>
                </div>
              )}
              {payment.payer_bank_name && (
                <div className="info-item full-width">
                  <span className="info-label">Банк</span>
                  <span className="info-value">{payment.payer_bank_name}</span>
                </div>
              )}
              {payment.payer_tax_code && (
                <div className="info-item">
                  <span className="info-label">ИНН</span>
                  <span className="info-value mono">{payment.payer_tax_code}</span>
                </div>
              )}
              {payment.payer_tax_reason_code && (
                <div className="info-item">
                  <span className="info-label">КПП</span>
                  <span className="info-value mono">{payment.payer_tax_reason_code}</span>
                </div>
              )}
              {payment.payer_correspondent_account && (
                <div className="info-item">
                  <span className="info-label">Корр. счёт</span>
                  <span className="info-value mono">{payment.payer_correspondent_account}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recipient Card */}
        {(payment.recipient_account || payment.recipient_name) && (
          <div className="card">
            <h3 className="card-title">Получатель</h3>
            <div className="info-grid">
              {payment.recipient_name && (
                <div className="info-item full-width">
                  <span className="info-label">Наименование</span>
                  <span className="info-value">{payment.recipient_name}</span>
                </div>
              )}
              {payment.recipient_account && (
                <div className="info-item">
                  <span className="info-label">Счёт</span>
                  <span className="info-value mono">{payment.recipient_account}</span>
                </div>
              )}
              {payment.recipient_bank_code && (
                <div className="info-item">
                  <span className="info-label">БИК</span>
                  <span className="info-value mono">{payment.recipient_bank_code}</span>
                </div>
              )}
              {payment.recipient_bank_name && (
                <div className="info-item full-width">
                  <span className="info-label">Банк</span>
                  <span className="info-value">{payment.recipient_bank_name}</span>
                </div>
              )}
              {payment.recipient_tax_code && (
                <div className="info-item">
                  <span className="info-label">ИНН</span>
                  <span className="info-value mono">{payment.recipient_tax_code}</span>
                </div>
              )}
              {payment.recipient_tax_reason_code && (
                <div className="info-item">
                  <span className="info-label">КПП</span>
                  <span className="info-value mono">{payment.recipient_tax_reason_code}</span>
                </div>
              )}
              {payment.recipient_correspondent_account && (
                <div className="info-item">
                  <span className="info-label">Корр. счёт</span>
                  <span className="info-value mono">{payment.recipient_correspondent_account}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timestamps Card */}
        <div className="card">
          <h3 className="card-title">Даты</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Создан</span>
              <span className="info-value">{formatDate(payment.created_at)}</span>
            </div>
            {payment.updated_at && (
              <div className="info-item">
                <span className="info-label">Обновлён</span>
                <span className="info-value">{formatDate(payment.updated_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* SBP Card */}
        {payment.cancel_reason_description && (
          <div className="card">
            <h3 className="card-title">СБП</h3>
            <div className="info-grid">
              <div className="info-item full-width">
                <span className="info-label">Причина отмены</span>
                <span className="info-value">{payment.cancel_reason_description}</span>
              </div>
            </div>
          </div>
        )}

        {/* Card payment Card */}
        {payment.deal_id && (
          <div className="card">
            <h3 className="card-title">Карточный платёж</h3>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">ID сделки</span>
                <span className="info-value mono">{payment.deal_id}</span>
              </div>
            </div>
          </div>
        )}

        {/* Virtual accounts (after identification) */}
        {payment.virtual_accounts && payment.virtual_accounts.length > 0 && (
          <div className="card">
            <h3 className="card-title">Виртуальные счета</h3>
            <div className="virtual-accounts-list">
              {payment.virtual_accounts.map((va, idx) => (
                <div key={idx} className="va-item mono">
                  {va}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional fields (fallback) */}
        {additionalFields.length > 0 && (
          <div className="card">
            <h3 className="card-title">Дополнительные поля</h3>
            <div className="info-grid">
              {additionalFields.map(([key, value]) => (
                <div key={key} className="info-item">
                  <span className="info-label">{key}</span>
                  <span className="info-value mono">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Identification Section */}
        {canIdentify && (
          <div className="card identify-card">
            <h3 className="card-title">Идентификация</h3>
            <p className="identify-description">
              Этот входящий платёж ещё не идентифицирован. Вы можете связать его с виртуальными счетами бенефициаров.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setShowIdentifyModal(true)}
            >
              Идентифицировать платёж
            </button>
          </div>
        )}

        {/* Unidentifiable types warning */}
        {payment.incoming && !payment.identify && !canIdentifyPaymentType(payment.type) && (
          <div className="card warning-card">
            <h3 className="card-title">Идентификация недоступна</h3>
            <p>
              Платёж типа &quot;{TYPE_LABELS[payment.type] || payment.type}&quot; не может быть идентифицирован вручную.
            </p>
          </div>
        )}
      </div>

      {/* Identify Modal */}
      {showIdentifyModal && payment && (
        <IdentifyModal
          payment={payment}
          virtualAccounts={virtualAccounts}
          isSubmitting={isIdentifying}
          onSubmit={handleIdentifySubmit}
          onClose={() => setShowIdentifyModal(false)}
          onSuccess={handleIdentifySuccess}
        />
      )}

      <style jsx>{`
        .payment-detail-page {
          max-width: 1200px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .header-left {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 14px;
          color: var(--text-secondary);
          text-decoration: none;
        }

        .back-link:hover {
          color: var(--text-primary);
        }

        .page-title {
          margin: 0;
          font-size: 24px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 20px;
        }

        .card-title {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .info-item.full-width {
          grid-column: 1 / -1;
        }

        .info-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-size: 14px;
          color: var(--text-primary);
          word-break: break-word;
        }

        .info-value.mono {
          font-family: monospace;
          font-size: 13px;
        }

        .info-value.purpose {
          line-height: 1.5;
        }

        .info-value.money {
          font-weight: 600;
          font-size: 16px;
        }

        .info-value.money.positive {
          color: var(--color-success);
        }

        .type-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          width: fit-content;
        }

        .type-badge.incoming {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .type-badge.outgoing {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .virtual-accounts-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .va-item {
          padding: 8px 12px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          font-size: 13px;
        }

        .identify-card {
          background: var(--color-primary-bg, rgba(59, 130, 246, 0.1));
          border: 1px solid var(--color-primary, #3b82f6);
        }

        .identify-description {
          margin: 0 0 16px 0;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .warning-card {
          background: var(--color-warning-bg);
          border: 1px solid var(--color-warning);
        }

        .warning-card p {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary);
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
          }

          .header-actions {
            width: 100%;
            justify-content: space-between;
          }

          .cards-grid {
            grid-template-columns: 1fr;
          }

          .info-grid {
            grid-template-columns: 1fr;
          }

          .info-item.full-width {
            grid-column: 1;
          }
        }
      `}</style>
    </div>
  );
}
