'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { BeneficiaryListItem, VirtualTransaction, OperationType } from '@/types/cyclops';

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

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

type TabType = 'accounts' | 'transactions';

export default function VirtualAccountsPage() {
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const {
    listVirtualAccounts,
    listBeneficiaries,
    getVirtualAccount,
    listVirtualTransactions,
    createVirtualAccount,
    transferBetweenVirtualAccounts,
    transferBetweenVirtualAccountsV2,
    getVirtualAccountsTransfer,
    refundVirtualAccount,
  } = useCyclops({ layer });

  const [accounts, setAccounts] = useState<VirtualAccount[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('accounts');
  const [isCached, setIsCached] = useState(false);

  // Фильтры
  const [filterInn, setFilterInn] = useState('');
  const [filterLegalType, setFilterLegalType] = useState<'F' | 'I' | 'J' | ''>('');
  const [filterIsActive, setFilterIsActive] = useState<boolean | ''>('');

  // Создание счёта
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<string>('');
  const [accountType, setAccountType] = useState<'standard' | 'for_ndfl'>('standard');
  const [isCreating, setIsCreating] = useState(false);

  // Перевод между счетами
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferVersion, setTransferVersion] = useState<'v1' | 'v2'>('v1');
  const [fromAccount, setFromAccount] = useState<string>('');
  const [toAccount, setToAccount] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferPurpose, setTransferPurpose] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);

  // Вывод средств (refund)
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAccount, setRefundAccount] = useState<string>('');
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundRecipientAccount, setRefundRecipientAccount] = useState<string>('');
  const [refundBankCode, setRefundBankCode] = useState<string>('');
  const [refundName, setRefundName] = useState<string>('');
  const [refundInn, setRefundInn] = useState<string>('');
  const [refundKpp, setRefundKpp] = useState<string>('');
  const [refundPurpose, setRefundPurpose] = useState<string>('');
  const [isRefunding, setIsRefunding] = useState(false);

  // Транзакции
  const [selectedAccountForTx, setSelectedAccountForTx] = useState<string>('');
  const [transactions, setTransactions] = useState<VirtualTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txDateFrom, setTxDateFrom] = useState<string>('');
  const [txDateTo, setTxDateTo] = useState<string>('');
  const [txIncludeBlock, setTxIncludeBlock] = useState(false);
  const [txTotals, setTxTotals] = useState<{ payouts: number; receipts: number; countPayouts: number; countReceipts: number }>({ payouts: 0, receipts: 0, countPayouts: 0, countReceipts: 0 });

  // Детали счёта
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedAccountDetails, setSelectedAccountDetails] = useState<VirtualAccount | null>(null);

  // Toast helper
  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const filters: { beneficiary?: Record<string, unknown> } = {};
      if (filterInn || filterLegalType || filterIsActive !== '') {
        filters.beneficiary = {};
        if (filterInn) filters.beneficiary.inn = filterInn;
        if (filterLegalType) filters.beneficiary.legal_type = filterLegalType;
        if (filterIsActive !== '') filters.beneficiary.is_active = filterIsActive;
      }

      const [accountsRes, beneficiariesRes] = await Promise.all([
        listVirtualAccounts({ filters: Object.keys(filters).length > 0 ? filters : undefined }),
        listBeneficiaries({ is_active: true }),
      ]);

      // Проверяем, были ли данные из кеша
      setIsCached(!!accountsRes._cache?.cached);

      const accountIds = accountsRes.result?.virtual_accounts;
      if (Array.isArray(accountIds) && accountIds.length > 0) {
        const accountDetails = await Promise.all(
          accountIds.map(async (accountId: string) => {
            try {
              const detailsRes = await getVirtualAccount(accountId);
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
        const mapped = beneficiariesList.map((b: BeneficiaryListItem) => ({
          beneficiary_id: b.id || '',
          type: b.legal_type === 'F' ? 'fl' : b.legal_type === 'I' ? 'ip' : 'ul',
          legal_type: b.legal_type,
          inn: b.inn,
          name: b.beneficiary_data?.name,
          first_name: b.beneficiary_data?.first_name,
          last_name: b.beneficiary_data?.last_name,
        })) as Beneficiary[];
        setBeneficiaries(mapped);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      showToast('error', message);
    } finally {
      setIsLoading(false);
    }
  }, [filterInn, filterLegalType, filterIsActive, getVirtualAccount, listBeneficiaries, listVirtualAccounts, showToast]);

  const loadTransactions = useCallback(async () => {
    if (!selectedAccountForTx) return;

    setTxLoading(true);
    try {
      const filters: Record<string, unknown> = {
        virtual_account: selectedAccountForTx,
        include_block_operations: txIncludeBlock,
      };
      if (txDateFrom) filters.created_date_from = txDateFrom;
      if (txDateTo) filters.created_date_to = txDateTo;

      const res = await listVirtualTransactions({ filters });
      if (res.result) {
        setTransactions(res.result.virtual_transactions || []);
        setTxTotals({
          payouts: res.result.total_payouts || 0,
          receipts: res.result.total_receipts || 0,
          countPayouts: res.result.count_payouts || 0,
          countReceipts: res.result.count_receipts || 0,
        });
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Ошибка загрузки транзакций');
    } finally {
      setTxLoading(false);
    }
  }, [listVirtualTransactions, selectedAccountForTx, showToast, txDateFrom, txDateTo, txIncludeBlock]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'transactions' && selectedAccountForTx) {
      loadTransactions();
    }
  }, [activeTab, loadTransactions, selectedAccountForTx]);

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
    return b.inn || '';
  };

  const getAccountBeneficiaryLabel = (account: VirtualAccount) => {
    const b = beneficiaries.find(ben => ben.beneficiary_id === account.beneficiary_id);
    if (b) {
      if (b.name) return b.name;
      if (b.first_name && b.last_name) return `${b.last_name} ${b.first_name}`;
      return b.inn || '';
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
      await createVirtualAccount({
        beneficiary_id: selectedBeneficiary,
        type: accountType,
      });

      addRecentAction({
        type: 'Создание счёта',
        description: `Создан виртуальный счёт (${accountType})`,
        layer,
      });

      showToast('success', 'Виртуальный счёт успешно создан');
      setShowCreateModal(false);
      setSelectedBeneficiary('');
      setAccountType('standard');
      await loadData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Ошибка при создании счёта');
    } finally {
      setIsCreating(false);
    }
  };

  const handleTransfer = async () => {
    if (!fromAccount || !toAccount || !transferAmount) return;

    setIsTransferring(true);
    setTransferStatus(null);
    try {
      if (transferVersion === 'v2') {
        const result = await transferBetweenVirtualAccountsV2({
          from_virtual_account: fromAccount,
          to_virtual_account: toAccount,
          amount: parseFloat(transferAmount),
          purpose: transferPurpose || undefined,
        });
        setTransferId(result.result?.transfer_id || null);
        setTransferStatus(result.result?.status || 'UNKNOWN');
        showToast('info', `Перевод создан. Статус: ${result.result?.status}`);
      } else {
        await transferBetweenVirtualAccounts({
          from_virtual_account: fromAccount,
          to_virtual_account: toAccount,
          amount: parseFloat(transferAmount),
        });
        showToast('success', 'Перевод выполнен успешно');
        setShowTransferModal(false);
      }

      addRecentAction({
        type: 'Перевод',
        description: `Переведено ${formatMoney(parseFloat(transferAmount))} между счетами`,
        layer,
      });

      setFromAccount('');
      setToAccount('');
      setTransferAmount('');
      setTransferPurpose('');
      await loadData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка при переводе';
      showToast('error', errorMsg);
      // Если это ошибка идемпотентности, показываем специальное сообщение
      if (errorMsg.includes('обрабатывается') || errorMsg.includes('4909')) {
        showToast('warning', 'Предыдущий запрос ещё обрабатывается. Подождите или проверьте историю операций.');
      }
    } finally {
      setIsTransferring(false);
    }
  };

  const checkTransferStatus = async () => {
    if (!transferId) return;
    try {
      const result = await getVirtualAccountsTransfer(transferId);
      setTransferStatus(result.result?.status || 'UNKNOWN');
      showToast('info', `Статус перевода: ${result.result?.status}`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Ошибка проверки статуса');
    }
  };

  const handleRefund = async () => {
    if (!refundAccount || !refundAmount || !refundRecipientAccount || !refundBankCode || !refundName) return;

    // Валидация
    if (!/^\d{20}$/.test(refundRecipientAccount)) {
      showToast('error', 'Номер счёта должен содержать ровно 20 цифр');
      return;
    }
    if (!/^\d{9}$/.test(refundBankCode)) {
      showToast('error', 'БИК должен содержать ровно 9 цифр');
      return;
    }
    if (refundInn && !/^\d{10}$|^\d{12}$/.test(refundInn)) {
      showToast('error', 'ИНН должен содержать 10 или 12 цифр');
      return;
    }
    if (refundKpp && !/^\d{9}$/.test(refundKpp)) {
      showToast('error', 'КПП должен содержать ровно 9 цифр');
      return;
    }
    if (refundPurpose && refundPurpose.length > 210) {
      showToast('error', 'Назначение платежа не может превышать 210 символов');
      return;
    }

    setIsRefunding(true);
    try {
      const result = await refundVirtualAccount({
        virtual_account: refundAccount,
        recipient: {
          amount: parseFloat(refundAmount),
          account: refundRecipientAccount,
          bank_code: refundBankCode,
          name: refundName,
          inn: refundInn || undefined,
          kpp: refundKpp || undefined,
        },
        purpose: refundPurpose || undefined,
      });

      addRecentAction({
        type: 'Вывод средств',
        description: `Выведено ${formatMoney(parseFloat(refundAmount))}`,
        layer,
      });

      showToast('success', `Вывод средств выполнен. Payment ID: ${result.result?.payment_id}`);
      setShowRefundModal(false);
      resetRefundForm();
      await loadData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Ошибка при выводе средств';
      showToast('error', errorMsg);
      if (errorMsg.includes('обрабатывается') || errorMsg.includes('4909')) {
        showToast('warning', 'Предыдущий запрос ещё обрабатывается. Проверьте историю операций.');
      }
    } finally {
      setIsRefunding(false);
    }
  };

  const resetRefundForm = () => {
    setRefundAccount('');
    setRefundAmount('');
    setRefundRecipientAccount('');
    setRefundBankCode('');
    setRefundName('');
    setRefundInn('');
    setRefundKpp('');
    setRefundPurpose('');
  };

  const openAccountDetails = (account: VirtualAccount) => {
    setSelectedAccountDetails(account);
    setShowDetailsModal(true);
  };

  const openRefundForAccount = (account: VirtualAccount) => {
    setRefundAccount(account.virtual_account_id);
    setShowRefundModal(true);
  };

  const openTransactionsForAccount = (account: VirtualAccount) => {
    setSelectedAccountForTx(account.virtual_account_id);
    setActiveTab('transactions');
  };

  const getOperationTypeLabel = (type: OperationType) => {
    const labels: Record<OperationType, string> = {
      cash_add: 'Пополнение',
      block_add: 'Блокировка',
      block_add_from_cash: 'Блокировка из доступных',
      cash_add_from_block: 'Разблокировка',
      block_write_off: 'Списание блокировки',
      cash_write_off: 'Списание',
    };
    return labels[type] || type;
  };

  return (
    <div className="accounts-page">
      {/* Toasts */}
      <div className="toasts-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>

      <header className="page-header">
        <div>
          <h1 className="page-title">
            Виртуальные счета
            {isCached && (
              <span className="cache-badge" title="Данные из кеша (обновление раз в 5 мин)">
                кеш
              </span>
            )}
          </h1>
          <p className="page-description">
            Управление счетами бенефициаров
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setShowRefundModal(true)}
            disabled={accounts.filter(a => a.type === 'standard' && a.available_amount > 0).length === 0}
          >
            Вывод средств
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowTransferModal(true)}
            disabled={accounts.length < 2}
          >
            Перевод
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

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'accounts' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          Счета
        </button>
        <button
          className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Операции
        </button>
      </div>

      {activeTab === 'accounts' && (
        <>
          {/* Filters */}
          <div className="filters-bar card">
            <div className="filter-group">
              <label>ИНН</label>
              <input
                type="text"
                className="form-input"
                placeholder="Поиск по ИНН"
                value={filterInn}
                onChange={(e) => setFilterInn(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>Тип</label>
              <select
                className="form-input form-select"
                value={filterLegalType}
                onChange={(e) => setFilterLegalType(e.target.value as typeof filterLegalType)}
              >
                <option value="">Все</option>
                <option value="F">Физлицо</option>
                <option value="I">ИП</option>
                <option value="J">Юрлицо</option>
              </select>
            </div>
            <div className="filter-group">
              <label>Статус</label>
              <select
                className="form-input form-select"
                value={filterIsActive === '' ? '' : filterIsActive ? 'true' : 'false'}
                onChange={(e) => setFilterIsActive(e.target.value === '' ? '' : e.target.value === 'true')}
              >
                <option value="">Все</option>
                <option value="true">Активные</option>
                <option value="false">Неактивные</option>
              </select>
            </div>
            <button className="btn btn-secondary" onClick={loadData}>
              Применить
            </button>
          </div>

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

                    <div className="account-actions">
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => openAccountDetails(account)}
                      >
                        Детали
                      </button>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => openTransactionsForAccount(account)}
                      >
                        Операции
                      </button>
                      {account.type === 'standard' && account.available_amount > 0 && (
                        <button
                          className="btn btn-sm btn-ghost"
                          onClick={() => openRefundForAccount(account)}
                        >
                          Вывод
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'transactions' && (
        <div className="card">
          <div className="transactions-header">
            <div className="filter-group">
              <label>Счёт</label>
              <select
                className="form-input form-select"
                value={selectedAccountForTx}
                onChange={(e) => setSelectedAccountForTx(e.target.value)}
              >
                <option value="">Выберите счёт</option>
                {accounts.map((a) => (
                  <option key={a.virtual_account_id} value={a.virtual_account_id}>
                    {getAccountBeneficiaryLabel(a)} ({a.virtual_account_id.slice(0, 8)}...)
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>С даты</label>
              <input
                type="date"
                className="form-input"
                value={txDateFrom}
                onChange={(e) => setTxDateFrom(e.target.value)}
              />
            </div>
            <div className="filter-group">
              <label>По дату</label>
              <input
                type="date"
                className="form-input"
                value={txDateTo}
                onChange={(e) => setTxDateTo(e.target.value)}
              />
            </div>
            <div className="filter-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={txIncludeBlock}
                  onChange={(e) => setTxIncludeBlock(e.target.checked)}
                />
                Включить блокировки
              </label>
            </div>
          </div>

          {selectedAccountForTx && (
            <div className="tx-totals">
              <div className="tx-total">
                <span className="tx-total-label">Поступления:</span>
                <span className="tx-total-value money-positive">{formatMoney(txTotals.receipts)}</span>
                <span className="tx-total-count">({txTotals.countReceipts})</span>
              </div>
              <div className="tx-total">
                <span className="tx-total-label">Списания:</span>
                <span className="tx-total-value">{formatMoney(txTotals.payouts)}</span>
                <span className="tx-total-count">({txTotals.countPayouts})</span>
              </div>
            </div>
          )}

          {txLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <span>Загрузка операций...</span>
            </div>
          ) : !selectedAccountForTx ? (
            <div className="empty-state">
              <p className="empty-state-title">Выберите счёт</p>
              <p className="empty-state-description">Для просмотра операций выберите виртуальный счёт</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">Нет операций</p>
              <p className="empty-state-description">По выбранному счёту нет операций за указанный период</p>
            </div>
          ) : (
            <div className="transactions-table">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Тип</th>
                    <th>Сумма</th>
                    <th>Описание</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="code">{new Date(tx.created_at).toLocaleString('ru-RU')}</td>
                      <td>
                        <span className={`tx-type ${tx.incoming ? 'incoming' : 'outgoing'}`}>
                          {getOperationTypeLabel(tx.operation_type)}
                        </span>
                      </td>
                      <td className={`money ${tx.incoming ? 'money-positive' : ''}`}>
                        {tx.incoming ? '+' : '-'}{formatMoney(tx.amount)}
                      </td>
                      <td>{tx.description || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Перевод между счетами</h3>
              <button className="modal-close" onClick={() => setShowTransferModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Версия API</label>
                <div className="type-options">
                  <label className={`type-option ${transferVersion === 'v1' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="transferVersion"
                      value="v1"
                      checked={transferVersion === 'v1'}
                      onChange={() => setTransferVersion('v1')}
                    />
                    <span className="type-content">
                      <span className="type-name">v1 (простой)</span>
                      <span className="type-desc">Мгновенный перевод</span>
                    </span>
                  </label>
                  <label className={`type-option ${transferVersion === 'v2' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="transferVersion"
                      value="v2"
                      checked={transferVersion === 'v2'}
                      onChange={() => setTransferVersion('v2')}
                    />
                    <span className="type-content">
                      <span className="type-name">v2 (с отслеживанием)</span>
                      <span className="type-desc">С назначением и статусом</span>
                    </span>
                  </label>
                </div>
              </div>

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

              {transferVersion === 'v2' && (
                <div className="form-group">
                  <label className="form-label">Назначение</label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={210}
                    value={transferPurpose}
                    onChange={(e) => setTransferPurpose(e.target.value)}
                    placeholder="Описание перевода (необязательно)"
                  />
                </div>
              )}

              {transferStatus && (
                <div className={`transfer-status status-${transferStatus.toLowerCase()}`}>
                  <strong>Статус:</strong> {transferStatus}
                  {transferId && (
                    <button className="btn btn-sm btn-ghost" onClick={checkTransferStatus}>
                      Обновить статус
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>
                Закрыть
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

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="modal-overlay" onClick={() => setShowRefundModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Вывод средств</h3>
              <button className="modal-close" onClick={() => setShowRefundModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">С виртуального счёта *</label>
                <select
                  className="form-input form-select"
                  value={refundAccount}
                  onChange={(e) => setRefundAccount(e.target.value)}
                  required
                >
                  <option value="">Выберите счёт</option>
                  {accounts.filter(a => a.type === 'standard' && a.available_amount > 0).map((a) => (
                    <option key={a.virtual_account_id} value={a.virtual_account_id}>
                      {getAccountBeneficiaryLabel(a)} — {formatMoney(a.available_amount)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Сумма *</label>
                  <input
                    type="number"
                    className="form-input"
                    step="0.01"
                    min="0.01"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <h4 className="form-section-title">Реквизиты получателя</h4>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Номер счёта * (20 цифр)</label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={20}
                    value={refundRecipientAccount}
                    onChange={(e) => setRefundRecipientAccount(e.target.value.replace(/\D/g, ''))}
                    placeholder="40702810000000000001"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">БИК * (9 цифр)</label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={9}
                    value={refundBankCode}
                    onChange={(e) => setRefundBankCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="044525225"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Наименование получателя *</label>
                <input
                  type="text"
                  className="form-input"
                  value={refundName}
                  onChange={(e) => setRefundName(e.target.value)}
                  placeholder="ООО Компания или ФИО"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">ИНН (10 или 12 цифр)</label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={12}
                    value={refundInn}
                    onChange={(e) => setRefundInn(e.target.value.replace(/\D/g, ''))}
                    placeholder="7707083893"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">КПП (9 цифр)</label>
                  <input
                    type="text"
                    className="form-input"
                    maxLength={9}
                    value={refundKpp}
                    onChange={(e) => setRefundKpp(e.target.value.replace(/\D/g, ''))}
                    placeholder="770701001"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Назначение платежа (до 210 символов)</label>
                <textarea
                  className="form-input form-textarea"
                  maxLength={210}
                  value={refundPurpose}
                  onChange={(e) => setRefundPurpose(e.target.value)}
                  placeholder="Оплата по договору №..."
                  rows={3}
                />
                <span className="form-hint">{refundPurpose.length}/210</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowRefundModal(false); resetRefundForm(); }}>
                Отмена
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRefund}
                disabled={isRefunding || !refundAccount || !refundAmount || !refundRecipientAccount || !refundBankCode || !refundName}
              >
                {isRefunding ? 'Обработка...' : 'Вывести'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Details Modal */}
      {showDetailsModal && selectedAccountDetails && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Детали счёта</h3>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-row">
                  <span className="detail-label">ID счёта</span>
                  <span className="detail-value code">{selectedAccountDetails.virtual_account_id}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Тип</span>
                  <span className={`detail-value account-type ${selectedAccountDetails.type}`}>
                    {selectedAccountDetails.type === 'standard' ? 'Стандартный' : 'Для НДФЛ'}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Бенефициар</span>
                  <span className="detail-value">{getAccountBeneficiaryLabel(selectedAccountDetails)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">ИНН бенефициара</span>
                  <span className="detail-value code">{selectedAccountDetails.beneficiary_inn || '-'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Доступно</span>
                  <span className="detail-value money money-positive">{formatMoney(selectedAccountDetails.available_amount)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Заблокировано</span>
                  <span className="detail-value money">{formatMoney(selectedAccountDetails.blocked_amount)}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>
                Закрыть
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowDetailsModal(false);
                  openTransactionsForAccount(selectedAccountDetails);
                }}
              >
                Смотреть операции
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

        .page-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cache-badge {
          font-size: 11px;
          font-weight: 500;
          padding: 2px 8px;
          background: var(--color-warning-bg);
          color: var(--color-warning);
          border-radius: 4px;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0;
        }

        .tab {
          padding: 10px 20px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s ease;
        }

        .tab:hover {
          color: var(--text-primary);
        }

        .tab.active {
          color: var(--accent-color);
          border-bottom-color: var(--accent-color);
        }

        .filters-bar {
          display: flex;
          gap: 16px;
          align-items: flex-end;
          flex-wrap: wrap;
          margin-bottom: 20px;
          padding: 16px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filter-group label {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .filter-group .form-input {
          min-width: 150px;
        }

        .checkbox-group {
          flex-direction: row;
          align-items: center;
        }

        .checkbox-group label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
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

        .account-actions {
          display: flex;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
        }

        .btn-ghost {
          background: none;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        .btn-ghost:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .transactions-header {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          align-items: flex-end;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .tx-totals {
          display: flex;
          gap: 24px;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .tx-total {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tx-total-label {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .tx-total-value {
          font-weight: 600;
        }

        .tx-total-count {
          color: var(--text-tertiary);
          font-size: 12px;
        }

        .transactions-table {
          overflow-x: auto;
        }

        .transactions-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .transactions-table th,
        .transactions-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
        }

        .transactions-table th {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
        }

        .tx-type {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .tx-type.incoming {
          background: var(--color-success-bg, #dcfce7);
          color: var(--color-success, #16a34a);
        }

        .tx-type.outgoing {
          background: var(--bg-secondary);
          color: var(--text-secondary);
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

        .modal-lg {
          max-width: 600px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-section-title {
          font-size: 14px;
          font-weight: 600;
          margin: 20px 0 12px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .form-textarea {
          resize: vertical;
          min-height: 80px;
        }

        .form-hint {
          font-size: 11px;
          color: var(--text-tertiary);
          margin-top: 4px;
        }

        .transfer-status {
          padding: 12px 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
        }

        .transfer-status.status-processing {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .transfer-status.status-success {
          background: var(--color-success-bg, #dcfce7);
          color: var(--color-success, #16a34a);
        }

        .transfer-status.status-canceled {
          background: var(--color-error-bg, #fef2f2);
          color: var(--color-error, #dc2626);
        }

        .details-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-color);
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .detail-value {
          font-weight: 500;
        }

        .toasts-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .toast {
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          max-width: 400px;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        .toast-success {
          background: var(--color-success-bg, #dcfce7);
          color: var(--color-success, #16a34a);
        }

        .toast-error {
          background: var(--color-error-bg, #fef2f2);
          color: var(--color-error, #dc2626);
        }

        .toast-warning {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .toast-info {
          background: var(--accent-bg);
          color: var(--accent-color);
        }

        @media (max-width: 1024px) {
          .summary-cards {
            grid-template-columns: repeat(2, 1fr);
          }

          .form-row {
            grid-template-columns: 1fr;
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

          .filters-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-group .form-input {
            min-width: unset;
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

          .transactions-header {
            flex-direction: column;
            align-items: stretch;
          }

          .tx-totals {
            flex-direction: column;
            gap: 8px;
          }

          .toasts-container {
            left: 20px;
            right: 20px;
          }

          .toast {
            max-width: none;
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
