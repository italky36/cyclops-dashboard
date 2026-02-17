'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { buildClientPath } from '@/lib/client-slug';

type PayoutType =
  | 'payment_contract'
  | 'payment_contract_by_sbp'
  | 'payment_contract_by_sbp_v2'
  | 'payment_contract_to_card'
  | 'none';

type SbpBank = { id: string; name: string };

type PayoutOption = {
  value: PayoutType;
  label: string;
  description: string;
  icon: string;
};

const PAYOUT_TYPES: PayoutOption[] = [
  { value: 'payment_contract', label: 'По реквизитам', description: 'Р/с + БИК + ИНН', icon: '🏦' },
  { value: 'payment_contract_by_sbp', label: 'СБП', description: 'По номеру телефона', icon: '📱' },
  { value: 'payment_contract_to_card', label: 'На карту', description: 'Перевод на банковскую карту', icon: '💳' },
];

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

export default function CreateClientPage() {
  const router = useRouter();
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<number | null>(null);

  // Основные данные
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [beneficiaryId] = useState('');

  // Условия выплат
  const [commissionPercent, setCommissionPercent] = useState('');
  const [payoutFrequency, setPayoutFrequency] = useState('');
  const [excludeDays, setExcludeDays] = useState('0');
  const [autoPayoutEnabled, setAutoPayoutEnabled] = useState(false);

  // Документ
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // Тип выплаты
  const [hasTemplate, setHasTemplate] = useState(false);
  const [payoutType, setPayoutType] = useState<PayoutType>('payment_contract');

  // Реквизиты банковского перевода
  const [bankAccount, setBankAccount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [inn, setInn] = useState('');
  const [kpp, setKpp] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [payoutPurpose, setPayoutPurpose] = useState('');

  // Реквизиты СБП
  const [sbpPhone, setSbpPhone] = useState('');
  const [sbpBankId, setSbpBankId] = useState('');
  const [sbpFirstName, setSbpFirstName] = useState('');
  const [sbpMiddleName, setSbpMiddleName] = useState('');
  const [sbpLastName, setSbpLastName] = useState('');

  // Реквизиты карты
  const [cardNumber, setCardNumber] = useState('');
  const [cardFirstName, setCardFirstName] = useState('');
  const [cardMiddleName, setCardMiddleName] = useState('');
  const [cardLastName, setCardLastName] = useState('');

  const [sbpBanks, setSbpBanks] = useState<SbpBank[]>([]);
  const [virtualAccounts, setVirtualAccounts] = useState<Array<{ id: string; balance?: number }>>([]);
  const [selectedVirtualAccount, setSelectedVirtualAccount] = useState('');

  const loadSbpBanks = useCallback(async () => {
    try {
      const res = await fetch('/api/sbp-banks');
      if (!res.ok) return;
      const data = await res.json();
      const banks = data?.result || data?.banks || data || [];
      if (Array.isArray(banks)) {
        const normalized = banks
          .map((bank: unknown) => {
            const bankObj = bank as { id?: string; bank_sbp_id?: string; name?: string };
            return {
              id: bankObj.id || bankObj.bank_sbp_id || '',
              name: bankObj.name || '',
            };
          })
          .filter((b) => b.id && b.name);
        setSbpBanks(normalized);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadVirtualAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/virtual-accounts?type=standard');
      if (!res.ok) return;
      const data = await res.json();
      const accounts = data?.virtual_accounts || data?.result?.virtual_accounts || [];
      if (Array.isArray(accounts)) {
        setVirtualAccounts(accounts.map((acc: unknown) => {
          if (typeof acc === 'string') {
            return { id: acc };
          }
          const accObj = acc as { id?: string; virtual_account?: string; code?: string; balance?: number; cash?: number };
          return {
            id: accObj.id || accObj.virtual_account || accObj.code || '',
            balance: typeof accObj.balance === 'number' ? accObj.balance : accObj.cash,
          };
        }).filter((acc) => acc.id));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadSbpBanks();
    loadVirtualAccounts();
  }, [loadSbpBanks, loadVirtualAccounts]);

  useEffect(() => {
    if (!hasTemplate && autoPayoutEnabled) {
      setAutoPayoutEnabled(false);
    }
  }, [hasTemplate, autoPayoutEnabled]);

  const encryptCardNumber = async (cardNum: string): Promise<string> => {
    const response = await fetch('/api/encrypt-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_number: cardNum, layer }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Ошибка шифрования номера карты');
    }
    return data.card_number_crypto_base64;
  };

  const uploadDocument = async (clientId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/clients/${clientId}/document`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || 'Ошибка загрузки документа');
    }
  };

  const handleDocSelect = (file?: File) => {
    if (!file) return;
    setDocumentFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const templateEnabled = hasTemplate;
      const effectiveAutoPayout = templateEnabled && autoPayoutEnabled;

      if (templateEnabled) {
        if (!commissionPercent || Number.isNaN(parseFloat(commissionPercent))) {
          throw new Error('Укажите комиссию платформы');
        }
      }

      if (effectiveAutoPayout) {
        if (!payoutFrequency) {
          throw new Error('Выберите период выплат');
        }
        if (!documentFile) {
          throw new Error('Загрузите документ для включения автовыплат');
        }
      }

      if (templateEnabled && !selectedVirtualAccount) {
        throw new Error('Выберите виртуальный счёт плательщика');
      }

      const excludeDaysValue = Number.parseInt(excludeDays, 10);
      const payoutExcludeDays = Number.isNaN(excludeDaysValue) ? 0 : excludeDaysValue;
      const purposeValue = payoutPurpose.trim();
      if (templateEnabled && purposeValue) {
        const maxLength = payoutType === 'payment_contract_by_sbp' || payoutType === 'payment_contract_by_sbp_v2' ? 140 : 210;
        if (purposeValue.length > maxLength) {
          throw new Error(`Назначение платежа не должно превышать ${maxLength} символов`);
        }
      }

      const body: Record<string, unknown> = {
        name,
        contact_name: contactName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        notes: notes || undefined,
        beneficiary_id: beneficiaryId || undefined,
        payout_type: templateEnabled ? payoutType : 'none',
        auto_payout_enabled: effectiveAutoPayout,
        payout_frequency: payoutFrequency || undefined,
        payout_exclude_days: payoutExcludeDays,
      };

      if (templateEnabled && purposeValue) {
        body.payout_purpose = purposeValue;
      }

      if (templateEnabled) {
        body.payout_virtual_account = selectedVirtualAccount;
      }

      if (commissionPercent) {
        const commission = parseFloat(commissionPercent);
        if (Number.isNaN(commission) || commission < 0 || commission > 100) {
          throw new Error('Комиссия должна быть числом от 0 до 100');
        }
        body.commission_percent = commission;
      }

      if (effectiveAutoPayout && payoutFrequency) {
        body.next_payout_at = new Date().toISOString().split('T')[0];
      }

      if (templateEnabled && payoutType === 'payment_contract') {
        body.bank_account = bankAccount;
        body.bank_code = bankCode;
        body.inn = inn;
        body.kpp = kpp || undefined;
        body.recipient_name = recipientName || undefined;
      }

      if (templateEnabled && (payoutType === 'payment_contract_by_sbp' || payoutType === 'payment_contract_by_sbp_v2')) {
        body.sbp_phone = sbpPhone;
        body.sbp_bank_id = sbpBankId;
        body.sbp_first_name = sbpFirstName;
        body.sbp_middle_name = sbpMiddleName || undefined;
        body.sbp_last_name = sbpLastName;
        body.inn = inn || undefined;
      }

      if (templateEnabled && payoutType === 'payment_contract_to_card') {
        const cleanCardNumber = cardNumber.replace(/\D/g, '');
        if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
          throw new Error('Номер карты должен содержать от 13 до 19 цифр');
        }
        body.card_number_encrypted = await encryptCardNumber(cleanCardNumber);
        body.card_first_name = cardFirstName;
        body.card_middle_name = cardMiddleName || undefined;
        body.card_last_name = cardLastName;
        body.inn = inn || undefined;
      }

      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка создания');
      }

      const data = await res.json();
      const clientId = data.client.id as number;
      setCreatedClientId(clientId);

      addRecentAction({
        type: 'Создание клиента',
        description: `Создан клиент: ${name}`,
        layer,
      });

      if (documentFile) {
        try {
          await uploadDocument(clientId, documentFile);
        } catch (uploadError) {
          setError(
            uploadError instanceof Error
              ? `Клиент создан, но документ не загрузился: ${uploadError.message}`
              : 'Клиент создан, но документ не загрузился'
          );
          setIsSubmitting(false);
          return;
        }
      }

      router.push(buildClientPath(clientId, name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-client-page">
      <header className="page-header">
        <div>
          <nav className="breadcrumb">
            <Link href="/clients">Клиенты</Link>
            <span>/</span>
            <span>Новый</span>
          </nav>
          <h1 className="page-title">Создать клиента</h1>
        </div>
      </header>

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

      {createdClientId && error && (
        <div className="info-message">
          <span>Клиент создан.</span>
          <Link href={buildClientPath(createdClientId, name)} className="text-link">Открыть клиента</Link>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-layout">
          <div className="card">
            <h2 className="card-title">Основная информация</h2>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Наименование *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="form-input"
                  placeholder="ООО «Компания» или ИП Иванов"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Контактное лицо</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="form-input"
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Телефон</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="form-input"
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="client@example.com"
                />
              </div>
              <div className="form-group full-width">
                <label className="form-label">Заметки</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="form-input form-textarea"
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Автовыплаты</h2>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoPayoutEnabled}
                  onChange={(e) => setAutoPayoutEnabled(e.target.checked)}
                  disabled={!hasTemplate}
                />
                <span>Включено</span>
              </label>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Период выплат</label>
                <select
                  className="form-input form-select"
                  value={payoutFrequency}
                  onChange={(e) => setPayoutFrequency(e.target.value)}
                  disabled={!hasTemplate || !autoPayoutEnabled}
                >
                  <option value="">Не задан</option>
                  <option value="weekly">Еженедельно</option>
                  <option value="biweekly">Раз в 2 недели</option>
                  <option value="monthly">Ежемесячно</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Исключить дней</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={30}
                  value={excludeDays}
                  onChange={(e) => setExcludeDays(e.target.value)}
                  disabled={!hasTemplate || !autoPayoutEnabled}
                />
              </div>
            </div>
            <p className="form-hint">
              Сумма выплаты формируется автоматически: продажи автоматов минус комиссия.
            </p>
            {!hasTemplate && (
              <p className="form-hint" style={{ marginTop: 6 }}>
                Добавьте шаблон выплаты, чтобы включить автовыплаты.
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Шаблон выплаты</h2>
              {!hasTemplate && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setHasTemplate(true)}
                >
                  Добавить сделку
                </button>
              )}
            </div>

            {!hasTemplate && (
              <p className="form-hint">
                Шаблон выплаты не задан. Можно добавить его сейчас или позже.
              </p>
            )}

            {hasTemplate && (
              <>
                <div className="form-row">
                <div className="form-group commission-field">
                  <label className="form-label">Комиссия платформы (%) *</label>
                  <div className="input-with-suffix">
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Напр. 3"
                        min={0}
                        max={100}
                        step={0.01}
                        value={commissionPercent}
                        onChange={(e) => setCommissionPercent(e.target.value)}
                        required
                      />
                      <span className="input-suffix">%</span>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Способ выплаты</label>
                  <div className="payment-types">
                    {PAYOUT_TYPES.map((pt) => {
                      const isSbpOption = pt.value === 'payment_contract_by_sbp';
                      const isActive = isSbpOption
                        ? payoutType === 'payment_contract_by_sbp' || payoutType === 'payment_contract_by_sbp_v2'
                        : payoutType === pt.value;
                      return (
                        <button
                          key={pt.value}
                          type="button"
                          className={`payment-type ${isActive ? 'active' : ''}`}
                          onClick={() => setPayoutType(isSbpOption ? 'payment_contract_by_sbp' : pt.value)}
                        >
                          <span className="type-icon">{pt.icon}</span>
                          <span>{pt.label}</span>
                          <span className="type-desc">{pt.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Виртуальный счёт (плательщик) *</label>
                  <select
                    className="form-input form-select"
                    value={selectedVirtualAccount}
                    onChange={(e) => setSelectedVirtualAccount(e.target.value)}
                    required
                  >
                    <option value="">Выберите счёт</option>
                    {virtualAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.id}
                        {typeof account.balance === 'number'
                          ? ` — ${new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(account.balance)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  {virtualAccounts.length === 0 && (
                    <p className="form-hint">Нет доступных виртуальных счетов типа standard.</p>
                  )}
                </div>

              </>
            )}

            {hasTemplate && payoutType === 'payment_contract' && (
              <div className="recipient-fields">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Расчётный счёт *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="40702810000000000001"
                      maxLength={20}
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, '').slice(0, 20))}
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
                      value={bankCode}
                      onChange={(e) => setBankCode(e.target.value.replace(/\D/g, '').slice(0, 9))}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Наименование получателя *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ООО Название или ФИО"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
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
                      value={inn}
                      onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
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
                      value={kpp}
                      onChange={(e) => setKpp(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Назначение платежа</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Оплата по договору N123. НДС не облагается"
                    maxLength={210}
                    value={payoutPurpose}
                    onChange={(e) => setPayoutPurpose(e.target.value)}
                  />
                  <p className="form-hint">Можно использовать {`{period}`} для подстановки периода.</p>
                </div>
              </div>
            )}

            {hasTemplate && (payoutType === 'payment_contract_by_sbp' || payoutType === 'payment_contract_by_sbp_v2') && (
              <div className="recipient-fields">
                <div className="form-group">
                  <label className="form-label">Версия API СБП</label>
                  <select
                    className="form-input form-select"
                    value={payoutType}
                    onChange={(e) => setPayoutType(e.target.value as PayoutType)}
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
                      value={sbpPhone ? formatPhone(sbpPhone) : ''}
                      onChange={(e) => setSbpPhone(normalizePhone(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Банк получателя *</label>
                    <select
                      className="form-input form-select"
                      value={sbpBankId}
                      onChange={(e) => setSbpBankId(e.target.value)}
                      required
                    >
                      <option value="">Выберите банк</option>
                      {sbpBanks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                    {sbpBanks.length === 0 && (
                      <p className="form-hint">Список банков СБП не загрузился. Проверьте подключение к Cyclops.</p>
                    )}
                  </div>
                </div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Фамилия *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={sbpLastName}
                      onChange={(e) => setSbpLastName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={sbpFirstName}
                      onChange={(e) => setSbpFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      value={sbpMiddleName}
                      onChange={(e) => setSbpMiddleName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">ИНН (опционально)</label>
                    <input
                      type="text"
                      className="form-input"
                      maxLength={12}
                      value={inn}
                      onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Назначение платежа (до 140 символов)</label>
                  <textarea
                    className="form-input form-textarea"
                    maxLength={140}
                    value={payoutPurpose}
                    onChange={(e) => setPayoutPurpose(e.target.value)}
                    placeholder="Необязательно"
                  />
                  <p className="form-hint">Можно использовать {`{period}`} для подстановки периода.</p>
                </div>
              </div>
            )}

            {hasTemplate && payoutType === 'payment_contract_to_card' && (
              <div className="recipient-fields">
                <div className="form-group">
                  <label className="form-label">Номер карты *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0000 0000 0000 0000"
                    maxLength={23}
                    value={formatCardNumber(cardNumber)}
                    onChange={(e) => setCardNumber(normalizeCardNumber(e.target.value))}
                    required
                  />
                  <p className="form-hint">Номер будет зашифрован перед сохранением</p>
                </div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Фамилия *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cardLastName}
                      onChange={(e) => setCardLastName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cardFirstName}
                      onChange={(e) => setCardFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      value={cardMiddleName}
                      onChange={(e) => setCardMiddleName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">ИНН (опционально)</label>
                    <input
                      type="text"
                      className="form-input"
                      maxLength={12}
                      value={inn}
                      onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Назначение платежа (до 210 символов)</label>
                  <textarea
                    className="form-input form-textarea"
                    maxLength={210}
                    value={payoutPurpose}
                    onChange={(e) => setPayoutPurpose(e.target.value)}
                    placeholder="Необязательно"
                  />
                  <p className="form-hint">Можно использовать {`{period}`} для подстановки периода.</p>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card-title">Документ (договор)</h2>
            <div className="form-group">
              <div
                className={`upload-dropzone ${isDraggingDoc ? 'drag' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingDoc(true);
                }}
                onDragLeave={() => setIsDraggingDoc(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingDoc(false);
                  handleDocSelect(e.dataTransfer.files?.[0]);
                }}
                onClick={() => docInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <div className="upload-icon">📄</div>
                <div className="upload-title">Перетащите файл сюда</div>
                <div className="upload-subtitle">или нажмите, чтобы выбрать</div>
                <div className="upload-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      docInputRef.current?.click();
                    }}
                  >
                    Выбрать файл
                  </button>
                </div>
                {documentFile && (
                  <div className="upload-file">Выбран файл: {documentFile.name}</div>
                )}
              </div>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.tiff,.bmp"
                className="file-input-hidden"
                onChange={(e) => handleDocSelect(e.target.files?.[0])}
              />
              {!documentFile && (
                <p className="form-hint">Поддерживаемые форматы: PDF, JPG, PNG, TIFF, BMP.</p>
              )}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <Link href="/clients" className="btn btn-secondary">
            Отмена
          </Link>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Сохранение...' : 'Создать клиента'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .create-client-page {
          max-width: 920px;
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

        .page-title {
          font-size: 24px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }

        .form-layout {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 24px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-row-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .form-input {
          padding: 10px 14px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--accent-color);
        }

        .form-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-select {
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%),
            linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%);
          background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px);
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
        }

        .form-textarea {
          resize: vertical;
          min-height: 60px;
        }

        .form-hint {
          font-size: 12px;
          color: var(--text-tertiary);
          margin: 2px 0 0;
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

        .commission-field {
          max-width: 180px;
        }

        @media (max-width: 767px) {
          .commission-field {
            max-width: 100%;
          }
        }

        .payment-types {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .payment-type {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 14px;
          border: 2px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-primary);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .payment-type:hover {
          border-color: var(--accent-color);
        }

        .payment-type.active {
          border-color: var(--accent-color);
          background: var(--accent-bg);
        }

        .type-icon {
          font-size: 18px;
        }

        .type-desc {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .recipient-fields {
          margin-top: 16px;
          padding: 16px;
          border-radius: 10px;
          background: var(--bg-secondary);
        }

        .file-input-hidden {
          display: none;
        }

        .upload-dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 22px;
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
          text-align: center;
        }

        .upload-dropzone.drag {
          border-color: var(--accent-color);
          background: var(--accent-bg);
          color: var(--text-primary);
        }

        .upload-icon {
          font-size: 20px;
        }

        .upload-title {
          font-weight: 600;
          color: var(--text-primary);
        }

        .upload-subtitle {
          font-size: 12px;
        }

        .upload-actions {
          margin-top: 6px;
        }

        .upload-file {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .file-input {
          font-size: 13px;
          color: var(--text-primary);
        }

        .toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .toggle input {
          width: 18px;
          height: 18px;
          accent-color: var(--accent-color);
        }

        .payout-account-info {
          padding: 14px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          margin-bottom: 20px;
        }

        .info-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }

        .info-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .info-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: var(--font-mono, monospace);
        }

        .warning-message {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 14px 16px;
          background: var(--color-warning-bg, #fffbeb);
          border: 1px solid var(--color-warning, #f59e0b);
          color: var(--color-warning, #f59e0b);
          border-radius: 10px;
          font-size: 14px;
          margin-bottom: 20px;
        }

        .warning-message strong {
          display: block;
          margin-bottom: 4px;
          color: var(--text-primary);
        }

        .warning-message p {
          margin: 0;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .error-message {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 12px 16px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #dc2626);
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 20px;
        }

        .info-message {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 20px;
        }

        .text-link {
          color: var(--accent-color);
          text-decoration: none;
          font-weight: 500;
        }

        .text-link:hover {
          text-decoration: underline;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          padding-top: 8px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-primary {
          background: var(--accent-color, #6366f1);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.9;
        }

        .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .btn-secondary:hover {
          background: var(--bg-tertiary);
        }

        @media (max-width: 767px) {
          .form-grid {
            grid-template-columns: 1fr;
          }

          .payment-types {
            grid-template-columns: 1fr;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .form-row-3 {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
