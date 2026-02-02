'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeal } from '@/hooks/useDeals';
import type { DealRecipient, DealRecipientInfo } from '@/types/cyclops/deals';

type RecipientType = 'payment_contract' | 'payment_contract_by_sbp' | 'payment_contract_by_sbp_v2' | 'payment_contract_to_card' | 'commission';

interface VirtualAccount {
  id: string;
  balance?: number;
  type?: string;
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

const formatCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  const parts = digits.match(/.{1,4}/g) || [];
  return parts.join(' ');
};

const normalizeCardNumber = (value: string) => value.replace(/\D/g, '').slice(0, 19);

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const normalized = digits.startsWith('7') ? digits.slice(1, 11) : digits.slice(0, 10);
  const parts = [
    normalized.slice(0, 3),
    normalized.slice(3, 6),
    normalized.slice(6, 8),
    normalized.slice(8, 10),
  ];
  return `+7 ${parts.filter(Boolean).join(' ')}`.trim();
};

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('7')) return digits.slice(0, 11);
  return `7${digits}`.slice(0, 11);
};

const mapRecipientToForm = (recipient: DealRecipientInfo): Recipient => {
  const requisites = (recipient.requisites || {}) as Record<string, unknown>;
  const base: Recipient = {
    id: crypto.randomUUID(),
    type: recipient.type as RecipientType,
    amount: String(recipient.amount),
  };

  switch (recipient.type) {
    case 'payment_contract':
      return {
        ...base,
        account: String(requisites.account || ''),
        bank_code: String(requisites.bank_code || ''),
        name: String(requisites.name || ''),
        inn: String(requisites.inn || ''),
        kpp: requisites.kpp ? String(requisites.kpp) : undefined,
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
      };
    case 'commission':
      return {
        ...base,
        name: String(requisites.name || ''),
        kpp: requisites.kpp ? String(requisites.kpp) : undefined,
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
      };
    case 'payment_contract_by_sbp':
    case 'payment_contract_by_sbp_v2':
      return {
        ...base,
        first_name: String(requisites.first_name || ''),
        last_name: String(requisites.last_name || ''),
        middle_name: requisites.middle_name ? String(requisites.middle_name) : undefined,
        phone_number: String(requisites.phone_number || ''),
        bank_sbp_id: String(requisites.bank_sbp_id || ''),
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
      };
    case 'payment_contract_to_card':
      return {
        ...base,
        first_name: String(requisites.first_name || ''),
        last_name: String(requisites.last_name || ''),
        middle_name: requisites.middle_name ? String(requisites.middle_name) : undefined,
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
        card_number: '', // Карта не отображается, нужно ввести заново
      };
    default:
      return base;
  }
};

export default function EditDealPage({ params }: { params: { dealId: string } }) {
  const router = useRouter();
  const { deal, loading, error: loadError, updateDeal } = useDeal(params.dealId);

  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccount[]>([]);
  const [sbpBanks, setSbpBanks] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [accountsRes, banksRes] = await Promise.all([
        fetch('/api/virtual-accounts?type=standard'),
        fetch('/api/sbp-banks'),
      ]);

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        const accounts = accountsData?.virtual_accounts || accountsData?.result?.virtual_accounts || [];

        if (Array.isArray(accounts)) {
          setVirtualAccounts(accounts.map((acc: unknown) => {
            if (typeof acc === 'string') {
              return { id: acc };
            }
            const accObj = acc as { id?: string; virtual_account?: string; code?: string; balance?: number; cash?: number; type?: string };
            return {
              id: accObj.id || accObj.virtual_account || accObj.code || '',
              balance: typeof accObj.balance === 'number' ? accObj.balance : accObj.cash,
              type: accObj.type,
            };
          }));
        }
      }

      if (banksRes.ok) {
        const banksData = await banksRes.json();
        const banks = banksData?.result || banksData?.banks || banksData || [];

        if (Array.isArray(banks)) {
          setSbpBanks(banks.map((bank: unknown) => {
            const bankObj = bank as { id?: string; bank_sbp_id?: string; name?: string };
            return {
              id: bankObj.id || bankObj.bank_sbp_id || '',
              name: bankObj.name || '',
            };
          }).filter((b) => b.id && b.name));
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (deal && !initialized) {
      if (deal.payers && deal.payers.length > 0) {
        setSelectedAccount(deal.payers[0].virtual_account);
      }
      if (deal.recipients && deal.recipients.length > 0) {
        setRecipients(deal.recipients.map(mapRecipientToForm));
      } else {
        setRecipients([{ id: crypto.randomUUID(), type: 'payment_contract', amount: '' }]);
      }
      setInitialized(true);
    }
  }, [deal, initialized]);

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

  const encryptCardNumber = async (cardNumber: string): Promise<string> => {
    const response = await fetch('/api/encrypt-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_number: cardNumber }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Ошибка шифрования номера карты');
    }
    return data.card_number_crypto_base64;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Валидация
      for (const r of recipients) {
        const index = recipients.indexOf(r) + 1;

        if (!r.amount || parseFloat(r.amount) <= 0) {
          setError(`Укажите сумму для получателя #${index}`);
          setIsSubmitting(false);
          return;
        }

        if (r.type === 'payment_contract_to_card') {
          const cardLength = (r.card_number || '').length;
          if (cardLength < 13 || cardLength > 19) {
            setError(`Номер карты должен содержать от 13 до 19 цифр (получатель #${index})`);
            setIsSubmitting(false);
            return;
          }
          if (!r.first_name || !r.last_name) {
            setError(`Укажите имя и фамилию получателя на карте (получатель #${index})`);
            setIsSubmitting(false);
            return;
          }
        }

        if (r.type === 'payment_contract') {
          if (!r.account || r.account.length !== 20) {
            setError(`Введите корректный номер счёта (20 цифр) для получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
          if (!r.bank_code || r.bank_code.length !== 9) {
            setError(`Введите корректный БИК (9 цифр) для получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
          if (!r.name) {
            setError(`Введите наименование получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
          if (!r.inn || (r.inn.length !== 10 && r.inn.length !== 12)) {
            setError(`Введите корректный ИНН (10 или 12 цифр) для получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
        }

        if (r.type === 'payment_contract_by_sbp' || r.type === 'payment_contract_by_sbp_v2') {
          if (!r.phone_number || r.phone_number.length !== 11) {
            setError(`Введите корректный номер телефона для получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
          if (!r.bank_sbp_id) {
            setError(`Выберите банк СБП для получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
          if (!r.first_name || !r.last_name) {
            setError(`Укажите имя и фамилию получателя #${index}`);
            setIsSubmitting(false);
            return;
          }
        }

        if (r.type === 'commission' && !r.name) {
          setError(`Введите наименование для комиссии #${index}`);
          setIsSubmitting(false);
          return;
        }
      }

      const preparedRecipients: DealRecipient[] = [];

      for (const r of recipients) {
        const index = recipients.indexOf(r);
        const number = index + 1;
        const amount = parseFloat(r.amount);

        switch (r.type) {
          case 'payment_contract':
            preparedRecipients.push({
              type: 'payment_contract',
              number,
              amount,
              account: r.account!,
              bank_code: r.bank_code!,
              name: r.name!,
              inn: r.inn!,
              kpp: r.kpp,
              purpose: r.purpose || 'Оплата по договору. НДС не облагается.',
            });
            break;
          case 'payment_contract_by_sbp':
            preparedRecipients.push({
              type: 'payment_contract_by_sbp',
              number,
              amount,
              phone_number: r.phone_number!,
              bank_sbp_id: r.bank_sbp_id!,
              first_name: r.first_name!,
              middle_name: r.middle_name,
              last_name: r.last_name!,
              purpose: r.purpose,
            });
            break;
          case 'payment_contract_by_sbp_v2':
            preparedRecipients.push({
              type: 'payment_contract_by_sbp_v2',
              number,
              amount,
              phone_number: r.phone_number!,
              bank_sbp_id: r.bank_sbp_id!,
              first_name: r.first_name!,
              middle_name: r.middle_name,
              last_name: r.last_name!,
              purpose: r.purpose,
            });
            break;
          case 'payment_contract_to_card':
            const encryptedCard = await encryptCardNumber(r.card_number || '');
            preparedRecipients.push({
              type: 'payment_contract_to_card',
              number,
              amount,
              card_number_crypto_base64: encryptedCard,
              recipient_fio: {
                first_name: r.first_name!,
                middle_name: r.middle_name,
                last_name: r.last_name!,
              },
              purpose: r.purpose,
            });
            break;
          case 'commission':
            preparedRecipients.push({
              type: 'commission',
              number,
              amount,
              name: r.name!,
              purpose: r.purpose,
            });
            break;
        }
      }

      const totalAmount = getTotalRecipients();

      const dealData = {
        ext_key: deal?.ext_key,
        amount: totalAmount,
        payers: [{
          virtual_account: selectedAccount,
          amount: totalAmount,
        }],
        recipients: preparedRecipients,
      };

      await updateDeal(dealData);
      router.push(`/deals/${params.dealId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при сохранении сделки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAccountData = virtualAccounts.find(a => a.id === selectedAccount);

  if (loading && !deal) {
    return <div className="loading">Загрузка...</div>;
  }

  if (loadError || !deal) {
    return <div className="card">{loadError || 'Сделка не найдена'}</div>;
  }

  if (!initialized) {
    return <div className="loading">Подготовка формы...</div>;
  }

  return (
    <div className="edit-deal-page">
      <header className="page-header">
        <div>
          <nav className="breadcrumb">
            <Link href="/deals">Сделки</Link>
            <span>/</span>
            <Link href={`/deals/${params.dealId}`}>{deal.ext_key?.slice(0, 8) || params.dealId.slice(0, 8)}...</Link>
            <span>/</span>
            <span>Редактирование</span>
          </nav>
          <h1 className="page-title">Редактирование сделки</h1>
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
                  <option key={account.id} value={account.id}>
                    {account.id}
                    {typeof account.balance === 'number' ? ` — ${formatMoney(account.balance)}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {selectedAccountData && typeof selectedAccountData.balance === 'number' && (
              <div className="account-info">
                <div className="info-row">
                  <span>Доступно:</span>
                  <span className="money">{formatMoney(selectedAccountData.balance)}</span>
                </div>
              </div>
            )}
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
                        className={`payment-type ${recipient.type === 'payment_contract_by_sbp' || recipient.type === 'payment_contract_by_sbp_v2' ? 'active' : ''}`}
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
                            onChange={(e) => updateRecipient(recipient.id, { account: e.target.value.replace(/\D/g, '').slice(0, 20) })}
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
                            onChange={(e) => updateRecipient(recipient.id, { bank_code: e.target.value.replace(/\D/g, '').slice(0, 9) })}
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
                            placeholder="10 или 12 цифр"
                            maxLength={12}
                            value={recipient.inn || ''}
                            onChange={(e) => updateRecipient(recipient.id, { inn: e.target.value.replace(/\D/g, '').slice(0, 12) })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">КПП</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="9 цифр"
                            maxLength={9}
                            value={recipient.kpp || ''}
                            onChange={(e) => updateRecipient(recipient.id, { kpp: e.target.value.replace(/\D/g, '').slice(0, 9) })}
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
                  {(recipient.type === 'payment_contract_by_sbp' || recipient.type === 'payment_contract_by_sbp_v2') && (
                    <div className="recipient-fields">
                      <div className="form-group">
                        <label className="form-label">Версия API СБП</label>
                        <select
                          className="form-input form-select"
                          value={recipient.type}
                          onChange={(e) => updateRecipient(recipient.id, { type: e.target.value as RecipientType })}
                        >
                          <option value="payment_contract_by_sbp">Оплата по договору</option>
                          <option value="payment_contract_by_sbp_v2">Платёж исполнителю/продавцу (b2c СБП)</option>
                        </select>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Номер телефона *</label>
                          <input
                            type="tel"
                            className="form-input"
                            placeholder="+7 ___ ___ __ __"
                            value={recipient.phone_number ? formatPhone(recipient.phone_number) : ''}
                            onChange={(e) => updateRecipient(recipient.id, { phone_number: normalizePhone(e.target.value) })}
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
                              <option key={bank.id} value={bank.id}>
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
                      <div className="form-group">
                        <label className="form-label">Назначение платежа (до 140 символов)</label>
                        <textarea
                          className="form-input form-textarea"
                          maxLength={140}
                          value={recipient.purpose || ''}
                          onChange={(e) => updateRecipient(recipient.id, { purpose: e.target.value })}
                          placeholder="Необязательно"
                        />
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
                          placeholder="0000 0000 0000 0000"
                          maxLength={23}
                          value={formatCardNumber(recipient.card_number || '')}
                          onChange={(e) => updateRecipient(recipient.id, { card_number: normalizeCardNumber(e.target.value) })}
                          required
                        />
                        <p className="form-hint">Номер карты (13-19 цифр) будет зашифрован перед отправкой</p>
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
                      <div className="form-group">
                        <label className="form-label">Назначение платежа (до 210 символов)</label>
                        <textarea
                          className="form-input form-textarea"
                          maxLength={210}
                          value={recipient.purpose || ''}
                          onChange={(e) => updateRecipient(recipient.id, { purpose: e.target.value })}
                          placeholder="Необязательно"
                        />
                      </div>
                    </div>
                  )}

                  {/* Комиссия */}
                  {recipient.type === 'commission' && (
                    <div className="recipient-fields">
                      <div className="form-group">
                        <label className="form-label">Наименование *</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Комиссия за услуги"
                          value={recipient.name || ''}
                          onChange={(e) => updateRecipient(recipient.id, { name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Назначение платежа</label>
                        <textarea
                          className="form-input form-textarea"
                          value={recipient.purpose || ''}
                          onChange={(e) => updateRecipient(recipient.id, { purpose: e.target.value })}
                          placeholder="Необязательно"
                        />
                      </div>
                      <div className="commission-info">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        <span>Комиссия будет перечислена на ваш расчётный счёт</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Итого */}
            <div className="deal-summary">
              <div className="summary-row">
                <span>Общая сумма сделки:</span>
                <span className="money">{formatMoney(getTotalRecipients())}</span>
              </div>
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
          <Link href={`/deals/${params.dealId}`} className="btn btn-secondary">
            Отмена
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !selectedAccount || getTotalRecipients() === 0}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                Сохранение...
              </>
            ) : (
              'Сохранить изменения'
            )}
          </button>
        </div>
      </form>

      <style jsx>{`
        .edit-deal-page {
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
          margin-top: 8px;
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
