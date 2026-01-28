'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
interface TenderHelpersHistoryEntry {
  id: number;
  service_pay_key: string | null;
  status: string | null;
  amount: number | null;
  purpose: string | null;
  recipient_account: string | null;
  recipient_bank_code: string | null;
  payer_account: string | null;
  payer_bank_code: string | null;
  created_at: string;
}

interface TenderHelpersPayer {
  id: string;
  payer_bank_code: string;
  payer_account: string;
  is_default: boolean;
}

interface TenderHelpersConfigData {
  base_url: string;
  recipient_account: string;
  recipient_bank_code: string;
  test_payers: TenderHelpersPayer[];
  configured: boolean;
}

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
  fields?: Record<string, string>;
}

const DEFAULT_BASE_URL = 'https://pre.tochka.com/api/v1/tender-helpers/';
const DEFAULT_PAYERS: TenderHelpersPayer[] = [
  {
    id: 'default-1',
    payer_bank_code: '044525104',
    payer_account: '40702810713500000456',
    is_default: true,
  },
  {
    id: 'default-2',
    payer_bank_code: '044525104',
    payer_account: '40702810403500000494',
    is_default: false,
  },
  {
    id: 'default-3',
    payer_bank_code: '044525104',
    payer_account: '40802810103500000306',
    is_default: false,
  },
];

const DEFAULT_PURPOSE = 'ТЕСТОВЫЙ СЛОЙ - Перевод денег, без НДС';
const HISTORY_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_process: 'В обработке',
  executed: 'Исполнен',
  rejected: 'Отклонён',
  returned: 'Возвращён',
};

const createPayer = (data?: Partial<TenderHelpersPayer>): TenderHelpersPayer => ({
  id: crypto.randomUUID(),
  payer_bank_code: data?.payer_bank_code || '',
  payer_account: data?.payer_account || '',
  is_default: data?.is_default || false,
});

const isValidDigits = (value: string, length: number) => new RegExp(`^\\d{${length}}$`).test(value);

const isValidUrl = (value: string) => {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const formatMoney = (amount: number | null | undefined) => {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
  }).format(amount);
};

export default function TenderHelpersPage() {
  const layer = useAppStore((s) => s.layer);
  const [activeTab, setActiveTab] = useState<'config' | 'transfer'>('config');

  const [config, setConfig] = useState<TenderHelpersConfigData>({
    base_url: '',
    recipient_account: '',
    recipient_bank_code: '',
    test_payers: [],
    configured: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [transferAmount, setTransferAmount] = useState('');
  const [transferPurpose, setTransferPurpose] = useState(DEFAULT_PURPOSE);
  const [transferRecipientAccount, setTransferRecipientAccount] = useState('');
  const [transferRecipientBic, setTransferRecipientBic] = useState('');
  const [selectedPayerId, setSelectedPayerId] = useState<string>('');
  const [customPayerEnabled, setCustomPayerEnabled] = useState(false);
  const [customPayerAccount, setCustomPayerAccount] = useState('');
  const [customPayerBic, setCustomPayerBic] = useState('');
  const [ackMismatch, setAckMismatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferResult, setTransferResult] = useState<{ status: string | null; service_pay_key: string | null } | null>(null);
  const [history, setHistory] = useState<TenderHelpersHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const prevConfigRef = useRef<{
    recipient_account: string;
    recipient_bank_code: string;
    defaultPayerId: string | null;
  } | null>(null);

  const configured = useMemo(
    () => Boolean(config.base_url && config.recipient_account && config.recipient_bank_code),
    [config]
  );

  const fetchConfig = useCallback(async () => {
    if (layer !== 'pre') {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/tender-helpers/config?layer=${layer}`);
      const data = (await response.json()) as ApiResponse<TenderHelpersConfigData>;
      if (!data.ok) {
        throw new Error(data.error?.message || 'Не удалось загрузить конфигурацию');
      }

      const loaded = data.data;
      if (!loaded) {
        throw new Error('Не удалось загрузить конфигурацию');
      }

      setConfig({
        base_url: loaded.base_url || '',
        recipient_account: loaded.recipient_account || '',
        recipient_bank_code: loaded.recipient_bank_code || '',
        test_payers: (loaded.test_payers || []).map((payer) => ({
          ...payer,
          id: payer.id ? String(payer.id) : crypto.randomUUID(),
        })),
        configured: loaded.configured,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Ошибка загрузки конфигурации');
    } finally {
      setIsLoading(false);
    }
  }, [layer]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const defaultPayer = config.test_payers.find((payer) => payer.is_default) || config.test_payers[0] || null;
    const prevConfig = prevConfigRef.current;

    if (!prevConfig || transferRecipientAccount === prevConfig.recipient_account) {
      setTransferRecipientAccount(config.recipient_account || '');
    }

    if (!prevConfig || transferRecipientBic === prevConfig.recipient_bank_code) {
      setTransferRecipientBic(config.recipient_bank_code || '');
    }

    if (!prevConfig || selectedPayerId === (prevConfig.defaultPayerId || '')) {
      if (defaultPayer) {
        setSelectedPayerId(defaultPayer.id);
      }
    }

    prevConfigRef.current = {
      recipient_account: config.recipient_account || '',
      recipient_bank_code: config.recipient_bank_code || '',
      defaultPayerId: defaultPayer?.id || null,
    };
  }, [config.recipient_account, config.recipient_bank_code, config.test_payers, isLoading, selectedPayerId, transferRecipientAccount, transferRecipientBic]);

  const applyDefaults = () => {
    setConfig((prev) => ({
      ...prev,
      base_url: prev.base_url || DEFAULT_BASE_URL,
      recipient_account: prev.recipient_account || '40702810020000104011',
      recipient_bank_code: prev.recipient_bank_code || '044525104',
      test_payers: prev.test_payers.length > 0 ? prev.test_payers : DEFAULT_PAYERS.map((payer) => ({
        ...payer,
        id: crypto.randomUUID(),
      })),
    }));
  };

  const handleAddPayer = () => {
    setConfig((prev) => ({
      ...prev,
      test_payers: [...prev.test_payers, createPayer()],
    }));
  };

  const handleDeletePayer = (id: string) => {
    setConfig((prev) => {
      const next = prev.test_payers.filter((payer) => payer.id !== id);
      if (next.length > 0 && !next.some((payer) => payer.is_default)) {
        next[0].is_default = true;
      }
      return { ...prev, test_payers: next };
    });
  };

  const handleUpdatePayer = (id: string, patch: Partial<TenderHelpersPayer>) => {
    setConfig((prev) => ({
      ...prev,
      test_payers: prev.test_payers.map((payer) =>
        payer.id === id ? { ...payer, ...patch } : payer
      ),
    }));
  };

  const handleSetDefault = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      test_payers: prev.test_payers.map((payer) => ({
        ...payer,
        is_default: payer.id === id,
      })),
    }));
  };

  const validateConfig = () => {
    const errors: Record<string, string> = {};

    if (!config.base_url || !isValidUrl(config.base_url)) {
      errors.base_url = 'Укажите корректный Base URL';
    }

    if (!isValidDigits(config.recipient_account, 20)) {
      errors.recipient_account = 'Счёт получателя должен содержать 20 цифр';
    }

    if (!isValidDigits(config.recipient_bank_code, 9)) {
      errors.recipient_bank_code = 'БИК получателя должен содержать 9 цифр';
    }

    if (config.test_payers.length === 0) {
      errors.test_payers = 'Добавьте хотя бы одного плательщика';
    }

    config.test_payers.forEach((payer, index) => {
      if (!isValidDigits(payer.payer_bank_code, 9)) {
        errors[`test_payers.${index}.payer_bank_code`] = 'БИК должен содержать 9 цифр';
      }
      if (!isValidDigits(payer.payer_account, 20)) {
        errors[`test_payers.${index}.payer_account`] = 'Счёт должен содержать 20 цифр';
      }
    });

    const defaultCount = config.test_payers.filter((payer) => payer.is_default).length;
    if (defaultCount !== 1) {
      errors.test_payers = 'Выберите ровно одного плательщика по умолчанию';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!validateConfig()) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        layer,
        base_url: config.base_url,
        recipient_account: config.recipient_account,
        recipient_bank_code: config.recipient_bank_code,
        test_payers: config.test_payers.map((payer) => ({
          payer_account: payer.payer_account,
          payer_bank_code: payer.payer_bank_code,
          is_default: payer.is_default,
        })),
      };

      const response = await fetch('/api/tender-helpers/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as ApiResponse<TenderHelpersConfigData>;
      if (!data.ok) {
        setFieldErrors(data.fields || {});
        throw new Error(data.error?.message || 'Не удалось сохранить конфигурацию');
      }

      const saved = data.data;
      if (saved) {
        setConfig({
          base_url: saved.base_url || '',
          recipient_account: saved.recipient_account || '',
          recipient_bank_code: saved.recipient_bank_code || '',
          test_payers: (saved.test_payers || []).map((payer) => ({
            ...payer,
            id: payer.id ? String(payer.id) : crypto.randomUUID(),
          })),
          configured: saved.configured,
        });
      }
      setFieldErrors({});
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const loadHistory = useCallback(async () => {
    if (layer !== 'pre') {
      return;
    }

    if (!config.recipient_account || !config.recipient_bank_code) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams({
        layer,
        limit: '20',
        recipient_account: config.recipient_account,
        recipient_bank_code: config.recipient_bank_code,
      });
      const response = await fetch(`/api/tender-helpers/history?${params.toString()}`);
      const data = (await response.json()) as { ok: boolean; data?: TenderHelpersHistoryEntry[]; error?: { message?: string } };
      if (!data.ok) {
        throw new Error(data.error?.message || 'Не удалось загрузить историю платежей');
      }
      setHistory(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Не удалось загрузить историю платежей');
    } finally {
      setHistoryLoading(false);
    }
  }, [config.recipient_account, config.recipient_bank_code, layer]);

  useEffect(() => {
    if (activeTab !== 'transfer') {
      return;
    }
    loadHistory();
  }, [activeTab, loadHistory, transferResult]);

  const selectedPayer = useMemo(() => {
    return config.test_payers.find((payer) => payer.id === selectedPayerId) || config.test_payers[0] || null;
  }, [config.test_payers, selectedPayerId]);

  const effectivePayer = useMemo(() => {
    if (customPayerEnabled) {
      return {
        payer_account: customPayerAccount,
        payer_bank_code: customPayerBic,
      };
    }
    return {
      payer_account: selectedPayer?.payer_account || '',
      payer_bank_code: selectedPayer?.payer_bank_code || '',
    };
  }, [customPayerAccount, customPayerBic, customPayerEnabled, selectedPayer]);

  const isMismatch =
    Boolean(effectivePayer.payer_bank_code && transferRecipientBic) &&
    effectivePayer.payer_bank_code !== transferRecipientBic;

  useEffect(() => {
    setAckMismatch(false);
  }, [effectivePayer.payer_bank_code, transferRecipientBic]);

  const amountValue = Number(transferAmount);
  const transferDisabled =
    isSubmitting ||
    !transferAmount ||
    Number.isNaN(amountValue) ||
    amountValue <= 0 ||
    !isValidDigits(transferRecipientAccount, 20) ||
    !isValidDigits(transferRecipientBic, 9) ||
    !isValidDigits(effectivePayer.payer_account, 20) ||
    !isValidDigits(effectivePayer.payer_bank_code, 9) ||
    (isMismatch && !ackMismatch);

  const handleTransfer = async () => {
    setTransferError(null);
    setTransferResult(null);

    if (transferDisabled) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/tender-helpers/transfer-money', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layer,
          recipient_account: transferRecipientAccount,
          recipient_bank_code: transferRecipientBic,
          amount: amountValue,
          purpose: transferPurpose || undefined,
          payer_account: effectivePayer.payer_account,
          payer_bank_code: effectivePayer.payer_bank_code,
        }),
      });

      const data = (await response.json()) as ApiResponse<{ status: string | null; service_pay_key: string | null }>;
      if (!data.ok) {
        throw new Error(data.error?.message || 'Не удалось выполнить перевод');
      }

      setTransferResult({
        status: data.data?.status ?? null,
        service_pay_key: data.data?.service_pay_key ?? null,
      });
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Не удалось выполнить перевод');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetTransfer = () => {
    setTransferResult(null);
    setTransferError(null);
    setTransferAmount('');
    setTransferPurpose(DEFAULT_PURPOSE);
    setAckMismatch(false);
  };

  const paymentsParams = useMemo(() => {
    const params = new URLSearchParams({
      incoming: 'true',
      identify: 'false',
      account: transferRecipientAccount,
      bic: transferRecipientBic,
      page: '1',
      per_page: '100',
      tender: '1',
    });
    return params.toString();
  }, [transferRecipientAccount, transferRecipientBic]);

  if (layer !== 'pre') {
    return (
      <div className="card">
        <h1 className="page-title">Tender-Helpers</h1>
        <p className="page-description">
          Раздел доступен только на PRE. Переключите слой в боковой панели.
        </p>
      </div>
    );
  }

  return (
    <div className="tender-helpers-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Tender-Helpers</h1>
          <p className="page-description">Test Layer: настройки и тестовые пополнения для PRE</p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          Настройки
        </button>
        <button
          className={`tab ${activeTab === 'transfer' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfer')}
        >
          Transfer money
        </button>
      </div>

      {activeTab === 'config' && (
        <div className="card">
          {isLoading ? (
            <div className="skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-block" />
            </div>
          ) : loadError ? (
            <div className="error-state">
              <p className="error-title">Не удалось загрузить настройки</p>
              <p className="error-description">{loadError}</p>
              <button className="btn btn-secondary" onClick={fetchConfig}>
                Повторить
              </button>
            </div>
          ) : (
            <div className="config-form">
              {!configured && (
                <div className="empty-config">
                  <div>
                    <h3>Настройте Tender-Helpers</h3>
                    <p>Заполните базовый URL, счёт получателя и тестовых плательщиков.</p>
                  </div>
                  <button className="btn btn-primary" onClick={applyDefaults}>
                    Заполнить значения по умолчанию
                  </button>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input
                  className={`form-input ${fieldErrors.base_url ? 'input-error' : ''}`}
                  value={config.base_url}
                  onChange={(e) => setConfig((prev) => ({ ...prev, base_url: e.target.value }))}
                  placeholder={DEFAULT_BASE_URL}
                  disabled={isSaving}
                />
                {fieldErrors.base_url && <div className="form-error">{fieldErrors.base_url}</div>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Счёт получателя</label>
                  <input
                    className={`form-input ${fieldErrors.recipient_account ? 'input-error' : ''}`}
                    value={config.recipient_account}
                    onChange={(e) => setConfig((prev) => ({ ...prev, recipient_account: e.target.value }))}
                    placeholder="20 цифр"
                    maxLength={20}
                    disabled={isSaving}
                  />
                  {fieldErrors.recipient_account && (
                    <div className="form-error">{fieldErrors.recipient_account}</div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">БИК получателя</label>
                  <input
                    className={`form-input ${fieldErrors.recipient_bank_code ? 'input-error' : ''}`}
                    value={config.recipient_bank_code}
                    onChange={(e) => setConfig((prev) => ({ ...prev, recipient_bank_code: e.target.value }))}
                    placeholder="9 цифр"
                    maxLength={9}
                    disabled={isSaving}
                  />
                  {fieldErrors.recipient_bank_code && (
                    <div className="form-error">{fieldErrors.recipient_bank_code}</div>
                  )}
                </div>
              </div>

              <div className="card-section">
                <div className="section-header">
                  <div>
                    <h3>Тестовые плательщики</h3>
                    <p className="section-hint">Добавьте счета плательщиков для генерации входящих платежей.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={handleAddPayer} disabled={isSaving}>
                    Add payer
                  </button>
                </div>

                {fieldErrors.test_payers && <div className="form-error">{fieldErrors.test_payers}</div>}

                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>БИК</th>
                        <th>Счёт</th>
                        <th>Default</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {config.test_payers.map((payer, index) => (
                        <tr key={payer.id}>
                          <td>
                            <input
                              className={`form-input table-input ${fieldErrors[`test_payers.${index}.payer_bank_code`] ? 'input-error' : ''}`}
                              value={payer.payer_bank_code}
                              onChange={(e) => handleUpdatePayer(payer.id, { payer_bank_code: e.target.value })}
                              maxLength={9}
                              disabled={isSaving}
                            />
                            {fieldErrors[`test_payers.${index}.payer_bank_code`] && (
                              <div className="form-error">{fieldErrors[`test_payers.${index}.payer_bank_code`]}</div>
                            )}
                          </td>
                          <td>
                            <input
                              className={`form-input table-input ${fieldErrors[`test_payers.${index}.payer_account`] ? 'input-error' : ''}`}
                              value={payer.payer_account}
                              onChange={(e) => handleUpdatePayer(payer.id, { payer_account: e.target.value })}
                              maxLength={20}
                              disabled={isSaving}
                            />
                            {fieldErrors[`test_payers.${index}.payer_account`] && (
                              <div className="form-error">{fieldErrors[`test_payers.${index}.payer_account`]}</div>
                            )}
                          </td>
                          <td>
                            <label className="form-radio">
                              <input
                                type="radio"
                                checked={payer.is_default}
                                onChange={() => handleSetDefault(payer.id)}
                                disabled={isSaving}
                              />
                              Default
                            </label>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeletePayer(payer.id)}
                              disabled={isSaving || config.test_payers.length === 1}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="form-hint">
                  Пополнение возможно при одинаковом БИК плательщика и получателя. “Дефолтный” payer на 044525999 не подходит
                  для recipient_bank_code=044525104.
                </div>
              </div>

              {saveError && <div className="form-error">{saveError}</div>}

              <div className="form-actions">
                <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <span className="spinner" /> Сохранение...
                    </>
                  ) : (
                    'Сохранить'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'transfer' && (
        <div className="card">
          {!configured ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="empty-state-title">Сначала настройте Tender-Helpers</p>
              <p className="empty-state-description">
                Заполните Base URL, счёт получателя и тестовых плательщиков на вкладке Настройки.
              </p>
              <button className="btn btn-primary" onClick={() => setActiveTab('config')}>
                Перейти к настройкам
              </button>
            </div>
          ) : (
            <div className="transfer-form">
              {transferResult ? (
                <div className="success-state">
                  <div className="success-header">
                    <span className="badge badge-success">Успешно</span>
                    <h3>Платёж создан</h3>
                  </div>
                  <div className="success-details">
                    <div>
                      <div className="detail-label">Status</div>
                      <div className="detail-value">{transferResult.status || '—'}</div>
                    </div>
                    <div>
                      <div className="detail-label">service_pay_key</div>
                      <div className="detail-value code">{transferResult.service_pay_key || '—'}</div>
                    </div>
                  </div>

                  <div className="success-actions">
                    <Link className="btn btn-primary" href={`/payments?${paymentsParams}`}>
                      Открыть Payments: неидентифицированные
                    </Link>
                    <Link className="btn btn-secondary" href={`/payments?${paymentsParams}&auto_find=1`}>
                      Найти платеж автоматически
                    </Link>
                    <button className="btn btn-ghost" onClick={resetTransfer}>
                      Новый перевод
                    </button>
                  </div>

                  <div className="checklist">
                    <h4>Перед идентификацией нужно</h4>
                    <p>Бенефициар + virtual account standard</p>
                    <div className="checklist-actions">
                      <Link className="btn btn-secondary" href="/beneficiaries">Beneficiaries</Link>
                      <Link className="btn btn-secondary" href="/virtual-accounts">Virtual Accounts</Link>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Счёт получателя</label>
                      <input
                        className="form-input"
                        value={transferRecipientAccount}
                        onChange={(e) => setTransferRecipientAccount(e.target.value)}
                        maxLength={20}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">БИК получателя</label>
                      <input
                        className="form-input"
                        value={transferRecipientBic}
                        onChange={(e) => setTransferRecipientBic(e.target.value)}
                        maxLength={9}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Сумма</label>
                      <input
                        className="form-input"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="100.00"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Назначение</label>
                      <input
                        className="form-input"
                        value={transferPurpose}
                        onChange={(e) => setTransferPurpose(e.target.value)}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Плательщик</label>
                    <select
                      className="form-input form-select"
                      value={selectedPayerId}
                      onChange={(e) => setSelectedPayerId(e.target.value)}
                      disabled={isSubmitting || customPayerEnabled}
                    >
                      {config.test_payers.map((payer) => (
                        <option key={payer.id} value={payer.id}>
                          {payer.payer_bank_code} · {payer.payer_account}
                          {payer.is_default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={customPayerEnabled}
                      onChange={(e) => setCustomPayerEnabled(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    Custom payer
                  </label>

                  {customPayerEnabled && (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Счёт плательщика</label>
                        <input
                          className="form-input"
                          value={customPayerAccount}
                          onChange={(e) => setCustomPayerAccount(e.target.value)}
                          maxLength={20}
                          disabled={isSubmitting}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">БИК плательщика</label>
                        <input
                          className="form-input"
                          value={customPayerBic}
                          onChange={(e) => setCustomPayerBic(e.target.value)}
                          maxLength={9}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  )}

                  {isMismatch && (
                    <div className="mismatch-warning">
                      <strong>БИК плательщика не совпадает с БИК получателя.</strong>
                      <span>По умолчанию перевод заблокирован, подтвердите риск.</span>
                      <label className="form-checkbox">
                        <input
                          type="checkbox"
                          checked={ackMismatch}
                          onChange={(e) => setAckMismatch(e.target.checked)}
                          disabled={isSubmitting}
                        />
                        Я понимаю риск
                      </label>
                    </div>
                  )}

                  {transferError && (
                    <div className="error-state">
                      <p className="error-title">Не удалось выполнить перевод</p>
                      <p className="error-description">{transferError}</p>
                      <p className="error-hint">Проверьте настройки Tender-Helpers.</p>
                    </div>
                  )}

                  <div className="form-actions">
                    <button className="btn btn-primary" onClick={handleTransfer} disabled={transferDisabled}>
                      {isSubmitting ? (
                        <>
                          <span className="spinner" /> Отправка...
                        </>
                      ) : (
                        'Transfer money'
                      )}
                    </button>
                  </div>
                </>
              )}

              <div className="card-section history-section">
                <div className="section-header">
                  <div>
                    <h3>История платежей</h3>
                    <p className="section-hint">
                      Последние входящие по счёту получателя в PRE
                    </p>
                  </div>
                  <button className="btn btn-secondary" onClick={loadHistory} disabled={historyLoading}>
                    {historyLoading ? (
                      <>
                        <span className="spinner" /> Обновление...
                      </>
                    ) : (
                      'Обновить'
                    )}
                  </button>
                </div>

                {historyError && <div className="form-error">{historyError}</div>}

                {!historyError && historyLoading && (
                  <div className="loading-inline">
                    <span className="spinner" /> Загрузка истории...
                  </div>
                )}

                {!historyError && !historyLoading && history.length === 0 && (
                  <div className="empty-history">Платежей пока нет.</div>
                )}

                {!historyError && !historyLoading && history.length > 0 && (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Сумма</th>
                          <th>Статус</th>
                          <th>Дата</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((payment, index) => {
                          const paymentId = payment.service_pay_key || '';
                          const statusLabel = HISTORY_STATUS_LABELS[payment.status || ''] || payment.status || '—';
                          return (
                            <tr key={paymentId || `history-${index}`}>
                              <td>
                                {paymentId ? (
                                  <span className="payment-id-link">
                                    {paymentId.slice(0, 8)}...
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td>{formatMoney(typeof payment.amount === 'number' ? payment.amount : Number.parseFloat(String(payment.amount || '')))}</td>
                              <td>{statusLabel}</td>
                              <td>{payment.created_at ? new Date(payment.created_at).toLocaleString('ru-RU') : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .tender-helpers-page {
          max-width: 1100px;
        }

        .config-form,
        .transfer-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .card-section {
          border-top: 1px solid var(--border-color);
          padding-top: 16px;
        }

        .history-section {
          margin-top: 8px;
        }

        .section-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 12px;
        }

        .section-header h3 {
          margin-bottom: 4px;
        }

        .section-hint {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .table-input {
          font-size: 14px;
          min-height: 40px;
        }

        .loading-inline {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-secondary);
          font-size: 14px;
        }

        .empty-history {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .payment-id-link {
          font-family: var(--font-mono);
          color: var(--accent-color);
          text-decoration: none;
        }

        .payment-id-link:hover {
          text-decoration: underline;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
        }

        .empty-config {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px;
          border-radius: 12px;
          background: var(--bg-secondary);
          border: 1px dashed var(--border-color);
        }

        .empty-config h3 {
          font-size: 16px;
          margin-bottom: 4px;
        }

        .empty-config p {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .skeleton-line {
          height: 16px;
          background: var(--bg-tertiary);
          border-radius: 8px;
          margin-bottom: 12px;
          animation: pulse 1.2s ease-in-out infinite;
        }

        .skeleton-block {
          height: 120px;
          background: var(--bg-tertiary);
          border-radius: 12px;
          animation: pulse 1.2s ease-in-out infinite;
        }

        .error-state {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: flex-start;
        }

        .error-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--color-error);
        }

        .error-description,
        .error-hint {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .success-state {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .success-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .success-details {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .detail-label {
          font-size: 12px;
          color: var(--text-tertiary);
          text-transform: uppercase;
        }

        .detail-value {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .code {
          font-family: var(--font-mono);
        }

        .success-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .checklist {
          padding: 16px;
          border-radius: 12px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .checklist h4 {
          margin-bottom: 4px;
        }

        .checklist p {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }

        .checklist-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .mismatch-warning {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid rgba(245, 158, 11, 0.4);
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        @keyframes pulse {
          0% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.5;
          }
        }

        @media (max-width: 767px) {
          .section-header {
            flex-direction: column;
            align-items: stretch;
          }

          .form-actions {
            justify-content: stretch;
          }

          .form-actions .btn {
            width: 100%;
          }

          .success-actions .btn,
          .checklist-actions .btn {
            flex: 1 1 100%;
          }
        }
      `}</style>

      <style jsx global>{`
        .input-error {
          border-color: var(--color-error) !important;
        }
      `}</style>
    </div>
  );
}
