'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';

interface VirtualAccount {
  virtual_account_id: string;
  beneficiary_id: string;
  beneficiary_inn?: string;
  type: 'standard' | 'for_ndfl';
  available_amount: number;
  blocked_amount: number;
}

interface Beneficiary {
  beneficiary_id: string;
  id?: string;
  type: string;
  legal_type?: string;
  inn: string;
  name?: string;
  first_name?: string;
  last_name?: string;
}

export default function VirtualAccountsPage() {
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const cyclops = useCyclops({ layer });

  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Создание счёта
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<string>('');
  const [accountType, setAccountType] = useState<'standard' | 'for_ndfl'>('standard');
  const [isCreating, setIsCreating] = useState(false);

  // Перевод между счетами
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [fromAccount, setFromAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [accountsRes, beneficiariesRes] = await Promise.all([
        cyclops.listVirtualAccounts(),
        cyclops.listBeneficiaries({ is_active: true }),
      ]);

      const accountIds = accountsRes.result?.virtual_accounts;
      if (Array.isArray(accountIds) && accountIds.length > 0) {
        const accountDetails = await Promise.all(
          accountIds.map(async (accountId: string) => {
            try {
              const detailsRes = await cyclops.getVirtualAccount(accountId);
              const details = detailsRes.result?.virtual_account;
              if (!details) return null;
              return {
                virtual_account_id: details.code || accountId,
                beneficiary_id: details.beneficiary_id,
                beneficiary_inn: details.beneficiary_inn,
                type: details.type === 'for_ndfl' ? 'for_ndfl' : 'standard',
                available_amount: typeof details.cash === 'number' ? details.cash : 0,
                blocked_amount: typeof details.blocked_cash === 'number' ? details.blocked_cash : 0,
              } as VirtualAccount;
            } catch {
              return null;
            }
          })
        );
        setAccounts(accountDetails.filter(Boolean) as VirtualAccount[]);
      } else {
        setAccounts([]);
      }
      const beneficiariesList = beneficiariesRes.result?.beneficiaries;
      if (Array.isArray(beneficiariesList)) {
        const mapped = beneficiariesList.map((b: Beneficiary) => {
          const beneficiaryId = b.beneficiary_id || b.id || '';
          let type = b.type;
          if (!type && b.legal_type) {
            if (b.legal_type === 'F') type = 'fl';
            else if (b.legal_type === 'I') type = 'ip';
            else if (b.legal_type === 'J') type = 'ul';
          }
          return {
            ...b,
            beneficiary_id: beneficiaryId,
            type: type || 'ul',
          };
        });
        setBeneficiaries(mapped);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [layer]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
    }).format(amount);
  };

  const getBeneficiaryName = (beneficiaryId: string) => {
    const b = beneficiaries.find(ben => ben.beneficiary_id === beneficiaryId);
    if (!b) return beneficiaryId.slice(0, 8) + '...';
    if (b.name) return b.name;
    if (b.first_name && b.last_name) return `${b.last_name} ${b.first_name}`;
    return b.inn;
  };

  const getAccountBeneficiaryLabel = (account: VirtualAccount) => {
    const b = beneficiaries.find(ben => ben.beneficiary_id === account.beneficiary_id);
    if (b) {
      if (b.name) return b.name;
      if (b.first_name && b.last_name) return `${b.last_name} ${b.first_name}`;
      return b.inn;
    }
    return account.beneficiary_inn || account.beneficiary_id.slice(0, 8) + '...';
  };

  const getTotalBalance = () => {
    return accounts.reduce((sum, a) => sum + a.available_amount + a.blocked_amount, 0);
  };

  const handleCreateAccount = async () => {
    if (!selectedBeneficiary) return;

    setIsCreating(true);
    try {
      await cyclops.createVirtualAccount({
        beneficiary_id: selectedBeneficiary,
        type: accountType,
      });

      addRecentAction({
        type: 'Создание счёта',
        description: `Создан виртуальный счёт (${accountType})`,
        layer,
      });

      setShowCreateModal(false);
      setSelectedBeneficiary('');
      setAccountType('standard');
      await loadData();
    } catch (error) {
      console.error('Failed to create account:', error);
      alert('Ошибка при создании счёта');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTransfer = async () => {
    if (!fromAccount || !toAccount || !transferAmount) return;

    setIsTransferring(true);
    try {
      await cyclops.call('transfer_between_virtual_accounts', {
        from_virtual_account: fromAccount,
        to_virtual_account: toAccount,
        amount: parseFloat(transferAmount),
      });

      addRecentAction({
        type: 'Перевод',
        description: `Переведено ${formatMoney(parseFloat(transferAmount))} между счетами`,
        layer,
      });

      setShowTransferModal(false);
      setFromAccount('');
      setToAccount('');
      setTransferAmount('');
      await loadData();
    } catch (error) {
      console.error('Failed to transfer:', error);
      alert('Ошибка при переводе');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className="accounts-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Виртуальные счета</h1>
          <p className="page-description">
            Управление счетами бенефициаров
          </p>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setShowTransferModal(true)}
            disabled={accounts.length < 2}
          >
            Перевод между счетами
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            disabled={beneficiaries.length === 0}
          >
            + Создать счёт
          </button>
        </div>
      </header>

      {/* Summary */}
      <div className="summary-cards">
        <div className="card summary-card">
          <span className="summary-label">Всего счетов</span>
          <span className="summary-value">{accounts.length}</span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">Общий баланс</span>
          <span className="summary-value money">{formatMoney(getTotalBalance())}</span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">Доступно</span>
          <span className="summary-value money money-positive">
            {formatMoney(accounts.reduce((sum, a) => sum + a.available_amount, 0))}
          </span>
        </div>
        <div className="card summary-card">
          <span className="summary-label">Заблокировано</span>
          <span className="summary-value">
            {formatMoney(accounts.reduce((sum, a) => sum + a.blocked_amount, 0))}
          </span>
        </div>
      </div>

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
              onClick={() => loadData()}
            >
              Повторить
            </button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="4" width="22" height="16" rx="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <p className="empty-state-title">Нет виртуальных счетов</p>
            <p className="empty-state-description">
              {beneficiaries.length === 0 
                ? 'Сначала создайте бенефициара'
                : 'Создайте виртуальный счёт для бенефициара'}
            </p>
            {beneficiaries.length > 0 && (
              <button 
                className="btn btn-primary" 
                style={{ marginTop: 16 }}
                onClick={() => setShowCreateModal(true)}
              >
                Создать счёт
              </button>
            )}
          </div>
        ) : (
          <div className="accounts-grid">
            {accounts.map((account) => (
              <div key={account.virtual_account_id} className="account-card">
                <div className="account-header">
                  <span className={`account-type ${account.type}`}>
                    {account.type === 'standard' ? 'Стандартный' : 'Для НДФЛ'}
                  </span>
                  <span className="account-id code">
                    {account.virtual_account_id.slice(0, 8)}...
                  </span>
                </div>
                
                <div className="account-beneficiary">
                  {getAccountBeneficiaryLabel(account)}
                </div>

                <div className="account-balances">
                  <div className="balance-row">
                    <span>Доступно</span>
                    <span className="money money-positive">
                      {formatMoney(account.available_amount)}
                    </span>
                  </div>
                  <div className="balance-row">
                    <span>Заблокировано</span>
                    <span className="money">
                      {formatMoney(account.blocked_amount)}
                    </span>
                  </div>
                </div>

              <div className="account-footer">
                  <span className="account-date code">
                    {account.virtual_account_id}
                  </span>
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Create Account Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Создать виртуальный счёт</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Бенефициар *</label>
                <select
                  className="form-input form-select"
                  value={selectedBeneficiary}
                  onChange={(e) => setSelectedBeneficiary(e.target.value)}
                  required
                >
                  <option value="">Выберите бенефициара</option>
                  {beneficiaries.map((b) => (
                    <option key={b.beneficiary_id} value={b.beneficiary_id}>
                      {getBeneficiaryName(b.beneficiary_id)} ({b.inn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Тип счёта</label>
                <div className="type-options">
                  <label className={`type-option ${accountType === 'standard' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="accountType"
                      value="standard"
                      checked={accountType === 'standard'}
                      onChange={() => setAccountType('standard')}
                    />
                    <span className="type-content">
                      <span className="type-name">Стандартный</span>
                      <span className="type-desc">Для обычных операций</span>
                    </span>
                  </label>
                  <label className={`type-option ${accountType === 'for_ndfl' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="accountType"
                      value="for_ndfl"
                      checked={accountType === 'for_ndfl'}
                      onChange={() => setAccountType('for_ndfl')}
                    />
                    <span className="type-content">
                      <span className="type-name">Для НДФЛ</span>
                      <span className="type-desc">Накопление налогов</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                Отмена
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateAccount}
                disabled={isCreating || !selectedBeneficiary}
              >
                {isCreating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Перевод между счетами</h3>
              <button className="modal-close" onClick={() => setShowTransferModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Со счёта *</label>
                <select
                  className="form-input form-select"
                  value={fromAccount}
                  onChange={(e) => setFromAccount(e.target.value)}
                  required
                >
                  <option value="">Выберите счёт</option>
                  {accounts.filter(a => a.available_amount > 0).map((a) => (
                    <option key={a.virtual_account_id} value={a.virtual_account_id}>
                      {getAccountBeneficiaryLabel(a)} — {formatMoney(a.available_amount)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">На счёт *</label>
                <select
                  className="form-input form-select"
                  value={toAccount}
                  onChange={(e) => setToAccount(e.target.value)}
                  required
                >
                  <option value="">Выберите счёт</option>
                  {accounts.filter(a => a.virtual_account_id !== fromAccount).map((a) => (
                    <option key={a.virtual_account_id} value={a.virtual_account_id}>
                      {getAccountBeneficiaryLabel(a)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Сумма перевода *</label>
                <input
                  type="number"
                  className="form-input"
                  step="0.01"
                  min="0.01"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>
                Отмена
              </button>
              <button
                className="btn btn-primary"
                onClick={handleTransfer}
                disabled={isTransferring || !fromAccount || !toAccount || !transferAmount}
              >
                {isTransferring ? 'Перевод...' : 'Перевести'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .accounts-page {
          max-width: 1400px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .summary-card {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .summary-label {
          font-size: 13px;
          color: var(--text-tertiary);
        }

        .summary-value {
          font-size: 24px;
          font-weight: 700;
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

        .accounts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .account-card {
          padding: 20px;
          background: var(--bg-secondary);
          border-radius: 12px;
          transition: box-shadow 0.2s ease;
        }

        .account-card:hover {
          box-shadow: var(--shadow-md);
        }

        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .account-type {
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 500;
          border-radius: 6px;
        }

        .account-type.standard {
          background: var(--accent-bg);
          color: var(--accent-color);
        }

        .account-type.for_ndfl {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .account-id {
          font-size: 12px;
        }

        .account-beneficiary {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 16px;
          color: var(--text-primary);
        }

        .account-balances {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: var(--bg-primary);
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .balance-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .account-footer {
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }

        .account-date {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .type-options {
          display: flex;
          gap: 12px;
        }

        .type-option {
          flex: 1;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 16px;
          background: var(--bg-secondary);
          border: 2px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .type-option:hover {
          border-color: var(--border-color);
        }

        .type-option.active {
          border-color: var(--accent-color);
          background: var(--accent-bg);
        }

        .type-option input {
          margin-top: 4px;
        }

        .type-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .type-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .type-desc {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        @media (max-width: 1024px) {
          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }

          .header-actions {
            flex-direction: column;
            gap: 10px;
          }

          .header-actions .btn {
            width: 100%;
          }

          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 16px;
          }

          .summary-card {
            padding: 16px;
          }

          .summary-value {
            font-size: 20px;
          }

          .accounts-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .account-card {
            padding: 16px;
          }

          .account-beneficiary {
            font-size: 15px;
          }

          .type-options {
            flex-direction: column;
            gap: 10px;
          }

          .type-option {
            padding: 14px;
          }

          .loading-state {
            padding: 32px 16px;
          }
        }

        @media (max-width: 374px) {
          .summary-cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
