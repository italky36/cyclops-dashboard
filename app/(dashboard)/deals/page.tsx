'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';

interface Deal {
  deal_id: string;
  status: string;
  created_at: string;
  payers: Array<{ virtual_account: string; amount: number }>;
  recipients: Array<{ type: string; amount: number }>;
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  new: { label: 'Новая', class: 'badge-neutral' },
  in_process: { label: 'В обработке', class: 'badge-warning' },
  correction: { label: 'Корректировка', class: 'badge-warning' },
  closed: { label: 'Завершена', class: 'badge-success' },
  cancelled: { label: 'Отменена', class: 'badge-error' },
};

export default function DealsPage() {
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const cyclops = useCyclops({ layer });

  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadDeals = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await cyclops.listDeals();
      if (Array.isArray(response.result)) {
        setDeals(response.result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      console.error('Failed to load deals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeals();
  }, [layer]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
    }).format(amount);
  };

  const getTotalAmount = (deal: Deal) => {
    return deal.payers.reduce((sum, p) => sum + p.amount, 0);
  };

  const handleExecute = async (deal: Deal) => {
    if (!confirm('Исполнить сделку? Это действие нельзя отменить.')) return;
    
    setActionLoading(deal.deal_id);
    try {
      await cyclops.executeDeal(deal.deal_id);
      addRecentAction({
        type: 'Исполнение сделки',
        description: `Сделка ${deal.deal_id.slice(0, 8)}... исполнена`,
        layer,
      });
      await loadDeals();
    } catch (error) {
      console.error('Failed to execute deal:', error);
      alert('Ошибка при исполнении сделки');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (deal: Deal) => {
    if (!confirm('Отменить сделку?')) return;
    
    setActionLoading(deal.deal_id);
    try {
      await cyclops.rejectDeal(deal.deal_id);
      addRecentAction({
        type: 'Отмена сделки',
        description: `Сделка ${deal.deal_id.slice(0, 8)}... отменена`,
        layer,
      });
      await loadDeals();
    } catch (error) {
      console.error('Failed to reject deal:', error);
      alert('Ошибка при отмене сделки');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="deals-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Сделки</h1>
          <p className="page-description">
            Управление выплатами с номинального счёта
          </p>
        </div>
        <Link href="/deals/new" className="btn btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Создать сделку
        </Link>
      </header>

      <div className="card">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Загрузка...</span>
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
            <p className="error-state-title">Ошибка загрузки</p>
            <p className="error-state-description">{error}</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => loadDeals()}
            >
              Повторить
            </button>
          </div>
        ) : deals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p className="empty-state-title">Нет сделок</p>
            <p className="empty-state-description">
              Создайте первую сделку для выплаты средств
            </p>
            <Link href="/deals/new" className="btn btn-primary" style={{ marginTop: 16 }}>
              Создать сделку
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Статус</th>
                  <th>Сумма</th>
                  <th>Получатели</th>
                  <th>Создана</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const status = STATUS_LABELS[deal.status] || { label: deal.status, class: 'badge-neutral' };
                  return (
                    <tr key={deal.deal_id}>
                      <td>
                        <span className="code">{deal.deal_id.slice(0, 8)}...</span>
                      </td>
                      <td>
                        <span className={`badge ${status.class}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <span className="money">{formatMoney(getTotalAmount(deal))}</span>
                      </td>
                      <td>
                        {deal.recipients.length} получатель(ей)
                      </td>
                      <td>
                        {new Date(deal.created_at).toLocaleDateString('ru-RU')}
                      </td>
                      <td>
                        <div className="actions">
                          {deal.status === 'new' && (
                            <>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleExecute(deal)}
                                disabled={actionLoading === deal.deal_id}
                              >
                                {actionLoading === deal.deal_id ? (
                                  <span className="spinner" />
                                ) : (
                                  'Исполнить'
                                )}
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => handleReject(deal)}
                                disabled={actionLoading === deal.deal_id}
                              >
                                Отменить
                              </button>
                            </>
                          )}
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setSelectedDeal(deal)}
                          >
                            Детали
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Deal Details Modal */}
      {selectedDeal && (
        <div className="modal-overlay" onClick={() => setSelectedDeal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Детали сделки</h3>
              <button className="modal-close" onClick={() => setSelectedDeal(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-group">
                <label>ID сделки</label>
                <span className="code">{selectedDeal.deal_id}</span>
              </div>
              <div className="detail-group">
                <label>Статус</label>
                <span className={`badge ${STATUS_LABELS[selectedDeal.status]?.class || 'badge-neutral'}`}>
                  {STATUS_LABELS[selectedDeal.status]?.label || selectedDeal.status}
                </span>
              </div>
              <div className="detail-group">
                <label>Создана</label>
                <span>{new Date(selectedDeal.created_at).toLocaleString('ru-RU')}</span>
              </div>
              
              <h4 style={{ marginTop: 20, marginBottom: 12 }}>Плательщики</h4>
              {selectedDeal.payers.map((payer, i) => (
                <div key={i} className="detail-card">
                  <div className="detail-row">
                    <span>Счёт:</span>
                    <span className="code">{payer.virtual_account.slice(0, 12)}...</span>
                  </div>
                  <div className="detail-row">
                    <span>Сумма:</span>
                    <span className="money">{formatMoney(payer.amount)}</span>
                  </div>
                </div>
              ))}

              <h4 style={{ marginTop: 20, marginBottom: 12 }}>Получатели</h4>
              {selectedDeal.recipients.map((recipient, i) => (
                <div key={i} className="detail-card">
                  <div className="detail-row">
                    <span>Тип:</span>
                    <span>{recipient.type}</span>
                  </div>
                  <div className="detail-row">
                    <span>Сумма:</span>
                    <span className="money">{formatMoney(recipient.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .deals-page {
          max-width: 1400px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
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
          color: var(--error-color, #ef4444);
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
          margin: 0;
          max-width: 500px;
          white-space: pre-line;
          line-height: 1.6;
        }

        .actions {
          display: flex;
          gap: 8px;
        }

        .detail-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 16px;
        }

        .detail-group label {
          font-size: 12px;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .detail-card {
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          padding: 4px 0;
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }

          .page-header > a {
            width: 100%;
          }

          .loading-state {
            padding: 32px 16px;
          }

          .actions {
            flex-wrap: wrap;
            gap: 6px;
          }

          .actions .btn {
            flex: 1;
            min-width: 80px;
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
            gap: 12px;
          }

          :global(.table td) {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            border-bottom: none;
          }

          :global(.table td:last-child) {
            flex-direction: column;
            align-items: stretch;
            padding-top: 12px;
            margin-top: 8px;
            border-top: 1px solid var(--border-color);
          }

          .detail-group {
            margin-bottom: 12px;
          }

          .detail-card {
            padding: 10px;
          }
        }
      `}</style>
    </div>
  );
}
