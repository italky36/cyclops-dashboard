'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';

export default function DashboardPage() {
  const layer = useAppStore((s) => s.layer);
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus);
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const recentActions = useAppStore((s) => s.recentActions);
  
  const {
    echo,
    listBeneficiaries,
    listVirtualAccounts,
    listDeals,
    listPayments,
    getVirtualAccount,
  } = useCyclops({ layer });
  
  const [stats, setStats] = useState({
    beneficiaries: 0,
    virtualAccounts: 0,
    deals: 0,
    pendingPayments: 0,
    totalBalance: 0,
  });
  
  const [isLoading, setIsLoading] = useState(true);

  // Тестирование подключения
  const testConnection = useCallback(async () => {
    try {
      await echo(`test-${Date.now()}`);
      setConnectionStatus(layer, 'connected');
    } catch {
      setConnectionStatus(layer, 'error');
    }
  }, [echo, layer, setConnectionStatus]);

  useEffect(() => {
    testConnection();
  }, [testConnection]);

  // Загрузка статистики
  const loadStats = useCallback(async () => {
    if (connectionStatus[layer] !== 'connected') return;
    
    setIsLoading(true);
    try {
      const [beneficiariesRes, accountsRes, dealsRes, paymentsRes] = await Promise.all([
        listBeneficiaries({ is_active: true }),
        listVirtualAccounts(),
        listDeals(),
        listPayments({ identified: false }),
      ]);

      // Подсчёт статистики из ответов
      const beneficiariesList = beneficiariesRes.result?.beneficiaries;
      const beneficiaries = Array.isArray(beneficiariesList)
        ? beneficiariesList.length : 0;
      const accountIds = Array.isArray(accountsRes.result?.virtual_accounts)
        ? accountsRes.result.virtual_accounts
        : [];
      const virtualAccounts = accountIds.length;
      const deals = Array.isArray(dealsRes.result)
        ? dealsRes.result.length : 0;
      const pendingPayments = Array.isArray(paymentsRes.result)
        ? paymentsRes.result.length : 0;

      // Подсчёт общего баланса
      let totalBalance = 0;
      if (accountIds.length > 0) {
        const accountDetails = await Promise.all(
          accountIds.map(async (accountId: string) => {
            try {
              const detailsRes = await getVirtualAccount(accountId);
              return detailsRes.result?.virtual_account || null;
            } catch {
              return null;
            }
          })
        );
        totalBalance = accountDetails.reduce((sum, acc) => {
          if (!acc) return sum;
          const cash = typeof acc.cash === 'number' ? acc.cash : 0;
          const blocked = typeof acc.blocked_cash === 'number' ? acc.blocked_cash : 0;
          return sum + cash + blocked;
        }, 0);
      }

      setStats({
        beneficiaries,
        virtualAccounts,
        deals,
        pendingPayments,
        totalBalance,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [connectionStatus, getVirtualAccount, layer, listBeneficiaries, listDeals, listPayments, listVirtualAccounts]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  };

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1 className="page-title">Обзор</h1>
        <p className="page-description">
          Управление номинальным счётом · Слой: {layer.toUpperCase()}
        </p>
      </header>

      {/* Connection Status */}
      <div className={`connection-banner ${connectionStatus[layer]}`}>
        <div className="connection-indicator">
          <span className={`status-dot ${connectionStatus[layer]}`} />
          <span>
            {connectionStatus[layer] === 'connected' && 'Подключено к Cyclops API'}
            {connectionStatus[layer] === 'error' && 'Ошибка подключения'}
            {connectionStatus[layer] === 'unknown' && 'Проверка подключения...'}
          </span>
        </div>
        {connectionStatus[layer] === 'error' && (
          <button 
            className="btn btn-sm btn-secondary"
            onClick={() => window.location.reload()}
          >
            Повторить
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-4 stats-grid">
        <div className="card stat-card">
          <span className="stat-label">Общий баланс</span>
          <span className="stat-value money">
            {isLoading ? '—' : formatMoney(stats.totalBalance)}
          </span>
        </div>
        
        <div className="card stat-card">
          <span className="stat-label">Бенефициары</span>
          <span className="stat-value">
            {isLoading ? '—' : stats.beneficiaries}
          </span>
        </div>
        
        <div className="card stat-card">
          <span className="stat-label">Виртуальные счета</span>
          <span className="stat-value">
            {isLoading ? '—' : stats.virtualAccounts}
          </span>
        </div>
        
        <div className="card stat-card">
          <span className="stat-label">Ожидают идентификации</span>
          <span className="stat-value">
            {isLoading ? '—' : stats.pendingPayments}
          </span>
          {stats.pendingPayments > 0 && (
            <span className="badge badge-warning">Требует действия</span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card quick-actions">
        <div className="card-header">
          <h2 className="card-title">Быстрые действия</h2>
        </div>
        <div className="actions-grid">
          <a href="/beneficiaries/new" className="action-card">
            <div className="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <span className="action-label">Добавить бенефициара</span>
          </a>
          
          <a href="/deals/new" className="action-card">
            <div className="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <span className="action-label">Создать сделку</span>
          </a>
          
          <a href="/payments" className="action-card">
            <div className="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <span className="action-label">Идентифицировать платежи</span>
          </a>
          
          <a href="/settings" className="action-card">
            <div className="action-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <span className="action-label">Настройки</span>
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Последние действия</h2>
        </div>
        {recentActions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p className="empty-state-title">Нет действий</p>
            <p className="empty-state-description">
              История ваших действий появится здесь
            </p>
          </div>
        ) : (
          <div className="activity-list">
            {recentActions.slice(0, 10).map((action) => (
              <div key={action.id} className="activity-item">
                <div className="activity-content">
                  <span className="activity-type">{action.type}</span>
                  <span className="activity-desc">{action.description}</span>
                </div>
                <div className="activity-meta">
                  <span className="activity-layer badge badge-neutral">
                    {action.layer.toUpperCase()}
                  </span>
                  <span className="activity-time">
                    {formatDate(action.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .dashboard {
          max-width: 1400px;
        }

        .connection-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 12px;
          margin-bottom: 24px;
          gap: 12px;
        }

        .connection-banner.connected {
          background: var(--color-success-bg);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .connection-banner.error {
          background: var(--color-error-bg);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .connection-banner.unknown {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
        }

        .connection-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 500;
          flex: 1;
          min-width: 0;
        }

        .connection-indicator span:last-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stats-grid {
          margin-bottom: 24px;
        }

        .quick-actions {
          margin-bottom: 24px;
        }

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .action-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 24px;
          background: var(--bg-secondary);
          border-radius: 12px;
          text-decoration: none;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          min-height: var(--touch-target-comfortable, 48px);
        }

        .action-card:hover {
          background: var(--bg-tertiary);
          transform: translateY(-2px);
        }

        .action-card:active {
          background: var(--bg-tertiary);
          transform: translateY(0);
        }

        .action-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-bg);
          color: var(--accent-color);
          border-radius: 12px;
          flex-shrink: 0;
        }

        .action-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          text-align: center;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
        }

        .activity-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 0;
          border-bottom: 1px solid var(--border-color);
          gap: 12px;
        }

        .activity-item:last-child {
          border-bottom: none;
        }

        .activity-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 0;
        }

        .activity-type {
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-tertiary);
        }

        .activity-desc {
          font-size: 14px;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .activity-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .activity-time {
          font-size: 12px;
          color: var(--text-tertiary);
          white-space: nowrap;
        }

        @media (max-width: 1024px) {
          .actions-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 767px) {
          .connection-banner {
            flex-wrap: wrap;
            padding: 14px 16px;
          }

          .connection-indicator {
            font-size: 13px;
          }

          .stats-grid {
            margin-bottom: 16px;
          }

          .quick-actions {
            margin-bottom: 16px;
          }

          .actions-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }

          .action-card {
            padding: 16px;
            gap: 10px;
          }

          .action-icon {
            width: 44px;
            height: 44px;
          }

          .action-icon svg {
            width: 22px;
            height: 22px;
          }

          .action-label {
            font-size: 13px;
          }

          .activity-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            padding: 16px 0;
          }

          .activity-meta {
            width: 100%;
            justify-content: space-between;
          }

          .activity-desc {
            white-space: normal;
            line-height: 1.4;
          }
        }

        @media (max-width: 374px) {
          .actions-grid {
            grid-template-columns: 1fr;
          }

          .action-card {
            flex-direction: row;
            justify-content: flex-start;
            padding: 14px 16px;
          }

          .action-label {
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
}
