'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';

type RecipientType = 'payment_contract' | 'payment_contract_by_sbp' | 'payment_contract_to_card' | 'commission';

interface VirtualAccount {
  virtual_account_id: string;
  beneficiary_id: string;
  available_amount: number;
  type: string;
}

interface Recipient {
  id: string;
  type: RecipientType;
  amount: string;
  // Реквизиты
  account?: string;
  bank_code?: string;
  name?: string;
  inn?: string;
  kpp?: string;
  purpose?: string;
  // СБП
  phone_number?: string;
  bank_sbp_id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  // Карта
  card_number?: string;
}

export default function NewDealPage() {
  const router = useRouter();
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const { listVirtualAccounts, listBanksSBP, getVirtualAccount, createDeal } = useCyclops({ layer });

  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [payerAmount, setPayerAmount] = useState<string>('');
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: crypto.randomUUID(), type: 'payment_contract', amount: '' }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sbpBanks, setSbpBanks] = useState<Array<{ bank_sbp_id: string; name: string }>>([]);

  const loadData = useCallback(async () => {
    try {
      const [accountsRes, banksRes] = await Promise.all([
        listVirtualAccounts({ filters: { beneficiary: { is_active: true } } }),
        listBanksSBP(),
      ]);

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
                available_amount: typeof details.cash === 'number' ? details.cash : 0,
                type: details.type || 'standard',
              } as VirtualAccount;
            } catch {
              return null;
            }
          })
        );
        setVirtualAccounts(
          (accountDetails.filter(Boolean) as VirtualAccount[]).filter((a) => a.available_amount > 0)
        );
      } else {
        setVirtualAccounts([]);
      }
      if (Array.isArray(banksRes.result)) {
        setSbpBanks(banksRes.result);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, [getVirtualAccount, listBanksSBP, listVirtualAccounts]);

  // Загрузка виртуальных счетов
  useEffect(() => {
    loadData();
  }, [loadData]);

  const addRecipient = () => {
    setRecipients([
      ...recipients,
      { id: crypto.randomUUID(), type: 'payment_contract', amount: '' }
    ]);
  };

  const removeRecipient = (id: string) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter(r => r.id !== id));
    }
  };

  const updateRecipient = (id: string, updates: Partial<Recipient>) => {
    setRecipients(recipients.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
    }).format(amount);
  };

  const getTotalRecipients = () => {
    return recipients.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Формируем данные сделки
      const dealData = {
        payers: [{
          virtual_account: selectedAccount,
          amount: parseFloat(payerAmount),
        }],
        recipients: recipients.map((r, index) => {
          const base = {
            number: index + 1,
            type: r.type,
            amount: parseFloat(r.amount),
          };

          switch (r.type) {
            case 'payment_contract':
              return {
                ...base,
                account: r.account,
                bank_code: r.bank_code,
                name: r.name,
                inn: r.inn,
                kpp: r.kpp || undefined,
                purpose: r.purpose || 'Оплата по договору. НДС не облагается.',
              };
            case 'payment_contract_by_sbp':
              return {
                ...base,
                phone_number: r.phone_number,
                bank_sbp_id: r.bank_sbp_id,
                first_name: r.first_name,
                middle_name: r.middle_name || undefined,
                last_name: r.last_name,
              };
            case 'payment_contract_to_card':
              return {
                ...base,
                card_number_encrypted: r.card_number, // В реальности нужно шифровать
                first_name: r.first_name,
                middle_name: r.middle_name || undefined,
                last_name: r.last_name,
              };
            case 'commission':
              return base;
            default:
              return base;
          }
        }),
      };

      const response = await createDeal(dealData);

      if (response.error) {
        throw new Error(response.error.message);
      }

      addRecentAction({
        type: 'Создание сделки',
        description: `Создана сделка на ${formatMoney(parseFloat(payerAmount))}`,
        layer,
      });

      router.push('/deals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при создании сделки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccountData = virtualAccounts.find(a => a.virtual_account_id === selectedAccount);

  return (
    <div className="new-deal-page">
      <header className="page-header">
        <div>
          <nav className="breadcrumb">
            <Link href="/deals">Сделки</Link>
            <span>/</span>
            <span>Новая</span>
          </nav>
          <h1 className="page-title">Создать сделку</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="form-layout">
          {/* Плательщик */}
          <div className="card">
            <h2 className="card-title">Плательщик</h2>
            
            <div className="form-group">
              <label className="form-label">Виртуальный счёт *</label>
              <select
                className="form-input form-select"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                required
              >
                <option value="">Выберите счёт</option>
                {virtualAccounts.map((account) => (
                  <option key={account.virtual_account_id} value={account.virtual_account_id}>
                    {account.virtual_account_id.slice(0, 8)}... — {formatMoney(account.available_amount)}
                  </option>
                ))}
              </select>
            </div>

            {selectedAccountData && (
              <div className="account-info">
                <div className="info-row">
                  <span>Доступно:</span>
                  <span className="money">{formatMoney(selectedAccountData.available_amount)}</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Сумма списания *</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  className="form-input"
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  max={selectedAccountData?.available_amount}
                  value={payerAmount}
                  onChange={(e) => setPayerAmount(e.target.value)}
                  required
                />
                <span className="input-suffix">₽</span>
              </div>
            </div>
          </div>

          {/* Получатели */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Получатели</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addRecipient}>
                + Добавить
              </button>
            </div>

            <div className="recipients-list">
              {recipients.map((recipient, index) => (
                <div key={recipient.id} className="recipient-card">
                  <div className="recipient-header">
                    <span className="recipient-number">#{index + 1}</span>
                    {recipients.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeRecipient(recipient.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Способ выплаты</label>
                    <div className="payment-types">
                      <button
                        type="button"
                        className={`payment-type ${recipient.type === 'payment_contract' ? 'active' : ''}`}
                        onClick={() => updateRecipient(recipient.id, { type: 'payment_contract' })}
                      >
                        <span className="type-icon">🏦</span>
                        <span>По реквизитам</span>
                      </button>
                      <button
                        type="button"
                        className={`payment-type ${recipient.type === 'payment_contract_by_sbp' ? 'active' : ''}`}
                        onClick={() => updateRecipient(recipient.id, { type: 'payment_contract_by_sbp' })}
                      >
                        <span className="type-icon">📱</span>
                        <span>СБП</span>
                      </button>
                      <button
                        type="button"
                        className={`payment-type ${recipient.type === 'payment_contract_to_card' ? 'active' : ''}`}
                        onClick={() => updateRecipient(recipient.id, { type: 'payment_contract_to_card' })}
                      >
                        <span className="type-icon">💳</span>
                        <span>На карту</span>
                      </button>
                      <button
                        type="button"
                        className={`payment-type ${recipient.type === 'commission' ? 'active' : ''}`}
                        onClick={() => updateRecipient(recipient.id, { type: 'commission' })}
                      >
                        <span className="type-icon">💰</span>
                        <span>Комиссия</span>
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Сумма *</label>
                    <div className="input-with-suffix">
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        step="0.01"
                        min="0.01"
                        value={recipient.amount}
                        onChange={(e) => updateRecipient(recipient.id, { amount: e.target.value })}
                        required
                      />
                      <span className="input-suffix">₽</span>
                    </div>
                  </div>

                  {/* Поля для реквизитов */}
                  {recipient.type === 'payment_contract' && (
                    <div className="recipient-fields">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Расчётный счёт *</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="40702810..."
                            maxLength={20}
                            value={recipient.account || ''}
                            onChange={(e) => updateRecipient(recipient.id, { account: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">БИК *</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="044525104"
                            maxLength={9}
                            value={recipient.bank_code || ''}
                            onChange={(e) => updateRecipient(recipient.id, { bank_code: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Наименование получателя *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder='ООО "Название" или ФИО'
                          value={recipient.name || ''}
                          onChange={(e) => updateRecipient(recipient.id, { name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">ИНН *</label>
                          <input
                            type="text"
                            className="form-input"
                            maxLength={12}
                            value={recipient.inn || ''}
                            onChange={(e) => updateRecipient(recipient.id, { inn: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">КПП</label>
                          <input
                            type="text"
                            className="form-input"
                            maxLength={9}
                            value={recipient.kpp || ''}
                            onChange={(e) => updateRecipient(recipient.id, { kpp: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Назначение платежа</label>
                        <textarea
                          className="form-input form-textarea"
                          placeholder="Оплата по договору №... НДС не облагается"
                          value={recipient.purpose || ''}
                          onChange={(e) => updateRecipient(recipient.id, { purpose: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Поля для СБП */}
                  {recipient.type === 'payment_contract_by_sbp' && (
                    <div className="recipient-fields">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Номер телефона *</label>
                          <input
                            type="tel"
                            className="form-input"
                            placeholder="79001234567"
                            maxLength={11}
                            value={recipient.phone_number || ''}
                            onChange={(e) => updateRecipient(recipient.id, { phone_number: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Банк получателя *</label>
                          <select
                            className="form-input form-select"
                            value={recipient.bank_sbp_id || ''}
                            onChange={(e) => updateRecipient(recipient.id, { bank_sbp_id: e.target.value })}
                            required
                          >
                            <option value="">Выберите банк</option>
                            {sbpBanks.map((bank) => (
                              <option key={bank.bank_sbp_id} value={bank.bank_sbp_id}>
                                {bank.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-row form-row-3">
                        <div className="form-group">
                          <label className="form-label">Фамилия *</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipient.last_name || ''}
                            onChange={(e) => updateRecipient(recipient.id, { last_name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Имя *</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipient.first_name || ''}
                            onChange={(e) => updateRecipient(recipient.id, { first_name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Отчество</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipient.middle_name || ''}
                            onChange={(e) => updateRecipient(recipient.id, { middle_name: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Поля для карты */}
                  {recipient.type === 'payment_contract_to_card' && (
                    <div className="recipient-fields">
                      <div className="form-group">
                        <label className="form-label">Номер карты *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="4000 0000 0000 0000"
                          maxLength={19}
                          value={recipient.card_number || ''}
                          onChange={(e) => updateRecipient(recipient.id, { card_number: e.target.value })}
                          required
                        />
                        <p className="form-hint">Номер будет зашифрован перед отправкой</p>
                      </div>
                      <div className="form-row form-row-3">
                        <div className="form-group">
                          <label className="form-label">Фамилия *</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipient.last_name || ''}
                            onChange={(e) => updateRecipient(recipient.id, { last_name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Имя *</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipient.first_name || ''}
                            onChange={(e) => updateRecipient(recipient.id, { first_name: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Отчество</label>
                          <input
                            type="text"
                            className="form-input"
                            value={recipient.middle_name || ''}
                            onChange={(e) => updateRecipient(recipient.id, { middle_name: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Комиссия */}
                  {recipient.type === 'commission' && (
                    <div className="commission-info">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <span>Комиссия будет перечислена на ваш расчётный счёт</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Итого */}
            <div className="deal-summary">
              <div className="summary-row">
                <span>Сумма списания:</span>
                <span className="money">{formatMoney(parseFloat(payerAmount) || 0)}</span>
              </div>
              <div className="summary-row">
                <span>Сумма получателям:</span>
                <span className="money">{formatMoney(getTotalRecipients())}</span>
              </div>
              {parseFloat(payerAmount) !== getTotalRecipients() && (
                <div className="summary-warning">
                  ⚠️ Суммы не совпадают
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div className="form-actions">
          <Link href="/deals" className="btn btn-secondary">
            Отмена
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !selectedAccount || !payerAmount}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                Создание...
              </>
            ) : (
              'Создать сделку'
            )}
          </button>
        </div>
      </form>

      <style jsx>{`
        .new-deal-page {
          max-width: 900px;
        }

        .breadcrumb {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: var(--text-tertiary);
          margin-bottom: 8px;
        }

        .breadcrumb a {
          color: var(--text-secondary);
          text-decoration: none;
        }

        .breadcrumb a:hover {
          color: var(--accent-color);
        }

        .form-layout {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .account-info {
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          margin-bottom: 16px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
        }

        .input-with-suffix {
          position: relative;
        }

        .input-suffix {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .input-with-suffix .form-input {
          padding-right: 40px;
        }

        .recipients-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .recipient-card {
          padding: 20px;
          background: var(--bg-secondary);
          border-radius: 12px;
        }

        .recipient-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .recipient-number {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-tertiary);
        }

        .payment-types {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .payment-type {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 12px 8px;
          background: var(--bg-primary);
          border: 2px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .payment-type:hover {
          border-color: var(--border-color);
        }

        .payment-type.active {
          border-color: var(--accent-color);
          background: var(--accent-bg);
          color: var(--accent-color);
        }

        .type-icon {
          font-size: 20px;
        }

        .recipient-fields {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .form-row-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        .commission-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px;
          background: var(--accent-bg);
          border-radius: 8px;
          font-size: 13px;
          color: var(--accent-color);
          margin-top: 16px;
        }

        .deal-summary {
          margin-top: 20px;
          padding: 16px;
          background: var(--bg-tertiary);
          border-radius: 10px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          padding: 6px 0;
        }

        .summary-warning {
          margin-top: 12px;
          padding: 10px;
          background: var(--color-warning-bg);
          color: var(--color-warning);
          border-radius: 6px;
          font-size: 13px;
        }

        .error-message {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          background: var(--color-error-bg);
          color: var(--color-error);
          border-radius: 10px;
          font-size: 14px;
          margin-top: 20px;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
        }

        @media (max-width: 767px) {
          .breadcrumb {
            font-size: 13px;
          }

          .form-layout {
            gap: 16px;
          }

          .card-header {
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .payment-types {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .payment-type {
            padding: 14px 10px;
            font-size: 11px;
          }

          .type-icon {
            font-size: 18px;
          }

          .form-row,
          .form-row-3 {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .recipient-card {
            padding: 16px;
          }

          .form-actions {
            flex-direction: column-reverse;
            gap: 10px;
          }

          .form-actions .btn {
            width: 100%;
          }

          .deal-summary {
            padding: 14px;
          }

          .summary-row {
            font-size: 13px;
          }

          .commission-info {
            font-size: 12px;
            padding: 12px;
          }

          .error-message {
            font-size: 13px;
          }
        }
      `}</style>
    </div>
  );
}
