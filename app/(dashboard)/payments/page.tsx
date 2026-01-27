'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';

interface Payment {
  payment_id: string;
  type: string;
  status: string;
  amount: number;
  identified: boolean;
  created_at: string;
  purpose?: string;
  payer_name?: string;
  payer_inn?: string;
}

interface VirtualAccount {
  virtual_account_id: string;
  beneficiary_id: string;
  available_amount: number;
}

const TYPE_LABELS: Record<string, string> = {
  incoming: 'Входящий',
  incoming_sbp: 'Входящий СБП',
  payment_contract: 'По реквизитам',
  commission: 'Комиссия',
  card: 'На карту',
  refund: 'Возврат',
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  new: { label: 'Новый', class: 'badge-neutral' },
  in_process: { label: 'В обработке', class: 'badge-warning' },
  executed: { label: 'Исполнен', class: 'badge-success' },
  rejected: { label: 'Отклонён', class: 'badge-error' },
  returned: { label: 'Возвращён', class: 'badge-error' },
};

export default function PaymentsPage() {
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const cyclops = useCyclops({ layer });

  const [payments, setPayments] = useState<Payment[]>([]);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unidentified' | 'incoming'>('all');
  
  // Модальное окно идентификации
  const [identifyPayment, setIdentifyPayment] = useState<Payment | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [identifyAmount, setIdentifyAmount] = useState<string>('');
  const [isIdentifying, setIsIdentifying] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [paymentsRes, accountsRes] = await Promise.all([
        cyclops.listPayments(filter === 'unidentified' ? { identified: false } : undefined),
        cyclops.listVirtualAccounts({ is_active: true }),
      ]);

      if (Array.isArray(paymentsRes.result)) {
        let filtered = paymentsRes.result;
        if (filter === 'incoming') {
          filtered = filtered.filter((p: Payment) => 
            p.type === 'incoming' || p.type === 'incoming_sbp'
          );
        }
        setPayments(filtered);
      }
      
      if (Array.isArray(accountsRes.result)) {
        setVirtualAccounts(accountsRes.result);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [layer, filter]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
    }).format(amount);
  };

  const handleIdentify = async () => {
    if (!identifyPayment || !selectedAccount || !identifyAmount) return;

    setIsIdentifying(true);
    try {
      await cyclops.identifyPayment({
        payment_id: identifyPayment.payment_id,
        owners: [{
          virtual_account: selectedAccount,
          amount: parseFloat(identifyAmount),
        }],
      });

      addRecentAction({
        type: 'Идентификация',
        description: `Платёж ${formatMoney(parseFloat(identifyAmount))} идентифицирован`,
        layer,
      });

      setIdentifyPayment(null);
      setSelectedAccount('');
      setIdentifyAmount('');
      await loadData();
    } catch (error) {
      console.error('Failed to identify payment:', error);
      alert('Ошибка при идентификации платежа');
    } finally {
      setIsIdentifying(false);
    }
  };

  const openIdentifyModal = (payment: Payment) => {
    setIdentifyPayment(payment);
    setIdentifyAmount(payment.amount.toString());
  };

  const unidentifiedCount = payments.filter(p => !p.identified && (p.type === 'incoming' || p.type === 'incoming_sbp')).length;

  return (
    <div className="payments-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Платежи</h1>
          <p className="page-description">
            Входящие и исходящие платежи по номинальному счёту
          </p>
        </div>
        {unidentifiedCount > 0 && (
          <div className="pending-badge">
            {unidentifiedCount} ожидают идентификации
          </div>
        )}
      </header>

      {/* Filters */}
      <div className="tabs" style={{ marginBottom: 24 }}>
        <button
          className={`tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Все платежи
        </button>
        <button
          className={`tab ${filter === 'unidentified' ? 'active' : ''}`}
          onClick={() => setFilter('unidentified')}
        >
          Неидентифицированные
          {unidentifiedCount > 0 && <span className="tab-badge">{unidentifiedCount}</span>}
        </button>
        <button
          className={`tab ${filter === 'incoming' ? 'active' : ''}`}
          onClick={() => setFilter('incoming')}
        >
          Входящие
        </button>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Загрузка...</span>
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <p className="empty-state-title">Нет платежей</p>
            <p className="empty-state-description">
              Платежи появятся после поступления средств на номинальный счёт
            </p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Идентифицирован</th>
                  <th>Назначение</th>
                  <th>Дата</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const status = STATUS_LABELS[payment.status] || { label: payment.status, class: 'badge-neutral' };
                  const isIncoming = payment.type === 'incoming' || payment.type === 'incoming_sbp';
                  
                  return (
                    <tr key={payment.payment_id}>
                      <td>
                        <span className={`type-badge ${isIncoming ? 'incoming' : 'outgoing'}`}>
                          {isIncoming ? '↓' : '↑'} {TYPE_LABELS[payment.type] || payment.type}
                        </span>
                      </td>
                      <td>
                        <span className={`money ${isIncoming ? 'money-positive' : ''}`}>
                          {isIncoming ? '+' : ''}{formatMoney(payment.amount)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${status.class}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        {payment.identified ? (
                          <span className="badge badge-success">Да</span>
                        ) : isIncoming ? (
                          <span className="badge badge-warning">Нет</span>
                        ) : (
                          <span className="badge badge-neutral">—</span>
                        )}
                      </td>
                      <td>
                        <span className="purpose-text">
                          {payment.purpose ? (
                            payment.purpose.length > 40 
                              ? payment.purpose.slice(0, 40) + '...' 
                              : payment.purpose
                          ) : '—'}
                        </span>
                      </td>
                      <td>
                        {new Date(payment.created_at).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        {isIncoming && !payment.identified && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => openIdentifyModal(payment)}
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
        )}
      </div>

      {/* Identify Modal */}
      {identifyPayment && (
        <div className="modal-overlay" onClick={() => setIdentifyPayment(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Идентификация платежа</h3>
              <button className="modal-close" onClick={() => setIdentifyPayment(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="payment-info">
                <div className="info-row">
                  <span>Сумма платежа:</span>
                  <span className="money money-positive">{formatMoney(identifyPayment.amount)}</span>
                </div>
                {identifyPayment.payer_name && (
                  <div className="info-row">
                    <span>Плательщик:</span>
                    <span>{identifyPayment.payer_name}</span>
                  </div>
                )}
                {identifyPayment.purpose && (
                  <div className="info-row">
                    <span>Назначение:</span>
                    <span className="purpose-text">{identifyPayment.purpose}</span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Виртуальный счёт бенефициара *</label>
                <select
                  className="form-input form-select"
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  required
                >
                  <option value="">Выберите счёт</option>
                  {virtualAccounts.map((account) => (
                    <option key={account.virtual_account_id} value={account.virtual_account_id}>
                      {account.virtual_account_id.slice(0, 12)}...
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Сумма идентификации *</label>
                <input
                  type="number"
                  className="form-input"
                  step="0.01"
                  min="0.01"
                  max={identifyPayment.amount}
                  value={identifyAmount}
                  onChange={(e) => setIdentifyAmount(e.target.value)}
                  required
                />
                <p className="form-hint">
                  Можно идентифицировать часть суммы на разные виртуальные счета
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setIdentifyPayment(null)}
              >
                Отмена
              </button>
              <button
                className="btn btn-primary"
                onClick={handleIdentify}
                disabled={isIdentifying || !selectedAccount || !identifyAmount}
              >
                {isIdentifying ? (
                  <>
                    <span className="spinner" />
                    Идентификация...
                  </>
                ) : (
                  'Идентифицировать'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .payments-page {
          max-width: 1400px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .pending-badge {
          padding: 8px 16px;
          background: var(--color-warning-bg);
          color: var(--color-warning);
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
        }

        .tab-badge {
          margin-left: 8px;
          padding: 2px 8px;
          background: var(--color-warning);
          color: white;
          border-radius: 10px;
          font-size: 12px;
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
        }

        .type-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
        }

        .type-badge.incoming {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .type-badge.outgoing {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .purpose-text {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .payment-info {
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }

        .info-row:not(:last-child) {
          border-bottom: 1px solid var(--border-color);
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .pending-badge {
            align-self: flex-start;
          }

          .tab-badge {
            margin-left: 6px;
            padding: 2px 6px;
          }

          .loading-state {
            padding: 32px 16px;
          }

          .type-badge {
            font-size: 12px;
            padding: 3px 8px;
          }

          .purpose-text {
            font-size: 12px;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          /* Преобразуем таблицу в карточки */
          :global(.table) {
            min-width: unset !important;
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

          :global(.table td:last-child) {
            padding-top: 12px;
            margin-top: 8px;
            border-top: 1px solid var(--border-color);
          }

          :global(.table td:last-child .btn) {
            width: 100%;
          }

          .payment-info {
            padding: 14px;
          }

          .info-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
            padding: 10px 0;
          }

          .info-row .purpose-text {
            max-width: none;
            white-space: normal;
            word-break: break-word;
          }
        }
      `}</style>
    </div>
  );
}
