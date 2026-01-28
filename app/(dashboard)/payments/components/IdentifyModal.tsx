'use client';

import { useState, useEffect } from 'react';
import type { PaymentDetail, IdentifyPaymentResult } from '@/types/cyclops';
import { validateIdentifyAmounts } from '@/lib/cyclops-validators';
import { getPaymentErrorConfig } from '@/lib/cyclops-errors';

interface VirtualAccountOption {
  virtual_account_id: string;
  beneficiary_inn?: string;
  type?: string;
}

interface Owner {
  virtual_account: string;
  amount: string;
}

interface IdentifyModalProps {
  payment: PaymentDetail;
  virtualAccounts: VirtualAccountOption[];
  isSubmitting: boolean;
  onSubmit: (params: {
    payment_id: string;
    is_returned_payment?: boolean;
    owners: Array<{ virtual_account: string; amount: number }>;
  }) => Promise<IdentifyPaymentResult | null>;
  onClose: () => void;
  onSuccess: () => void;
}

export function IdentifyModal({
  payment,
  virtualAccounts,
  isSubmitting,
  onSubmit,
  onClose,
  onSuccess,
}: IdentifyModalProps) {
  const rawAmount = (payment as { amount?: unknown }).amount;
  let paymentAmount: number | null = null;
  if (typeof rawAmount === 'number' && Number.isFinite(rawAmount)) {
    paymentAmount = rawAmount;
  } else if (typeof rawAmount === 'string') {
    const parsed = Number.parseFloat(rawAmount);
    paymentAmount = Number.isFinite(parsed) ? parsed : null;
  }
  const initialAmount = paymentAmount !== null ? paymentAmount.toFixed(2) : '';
  const [owners, setOwners] = useState<Owner[]>([
    { virtual_account: '', amount: initialAmount }
  ]);
  const [isReturnedPayment, setIsReturnedPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<IdentifyPaymentResult | null>(null);

  // Фильтруем только standard виртуальные счета
  const standardAccounts = virtualAccounts.filter(
    (va) => !va.type || va.type === 'standard'
  );

  // Валидация суммы при изменении owners
  useEffect(() => {
    if (paymentAmount === null) {
      setValidationError('Сумма платежа не определена');
      return;
    }

    const ownerAmounts = owners.map((o) => ({
      amount: parseFloat(o.amount) || 0,
    }));
    const validation = validateIdentifyAmounts(paymentAmount, ownerAmounts);
    setValidationError(validation.valid ? null : validation.error || null);
  }, [owners, paymentAmount]);

  const formatMoney = (amount: number | null) => {
    if (amount === null || !Number.isFinite(amount)) {
      return '—';
    }
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
    }).format(amount);
  };

  const addOwner = () => {
    setOwners([...owners, { virtual_account: '', amount: '' }]);
  };

  const removeOwner = (index: number) => {
    if (owners.length > 1) {
      setOwners(owners.filter((_, i) => i !== index));
    }
  };

  const updateOwner = (index: number, field: keyof Owner, value: string) => {
    const updated = [...owners];
    updated[index] = { ...updated[index], [field]: value };
    setOwners(updated);
  };

  const getTotalAmount = () => {
    return owners.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
  };

  const getRemainingAmount = () => {
    if (paymentAmount === null) {
      return 0;
    }
    return paymentAmount - getTotalAmount();
  };

  const handleSubmit = async () => {
    setError(null);

    // Валидация
    const paymentId = payment.payment_id || (payment as { id?: string }).id || '';
    if (!paymentId) {
      setError('Не найден идентификатор платежа');
      return;
    }

    if (owners.some((o) => !o.virtual_account)) {
      setError('Выберите виртуальный счёт для каждого owner');
      return;
    }

    const parsedOwners = owners.map((o) => {
      const parsed = Number.parseFloat(o.amount);
      const normalized = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN;
      return {
        virtual_account: o.virtual_account,
        amount: normalized,
      };
    });

    if (parsedOwners.some((o) => !Number.isFinite(o.amount) || o.amount <= 0)) {
      setError('Укажите корректную сумму для каждого owner');
      return;
    }

    if (paymentAmount === null) {
      setError('Сумма платежа не определена');
      return;
    }

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const response = await onSubmit({
        payment_id: paymentId,
        is_returned_payment: isReturnedPayment ? true : undefined,
        owners: parsedOwners,
      });

      if (response) {
        setResult(response);
      }
    } catch (err) {
      const errorCode = (err as { code?: number })?.code;
      if (errorCode) {
        const config = getPaymentErrorConfig(errorCode);
        if (config) {
          setError(`${config.title}: ${config.message}\n${config.hint || ''}`);
        } else {
          setError(err instanceof Error ? err.message : 'Ошибка идентификации');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Ошибка идентификации');
      }
    }
  };

  // Success state
  if (result) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Идентификация выполнена</h3>
            <button className="modal-close" onClick={onClose}>
              &times;
            </button>
          </div>
          <div className="modal-body">
            <div className="success-message">
              <div className="success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p>Платёж успешно идентифицирован</p>
            </div>

            {result.virtual_accounts && result.virtual_accounts.length > 0 && (
              <div className="result-section">
                <h4>Виртуальные счета:</h4>
                <table className="result-table">
                  <thead>
                    <tr>
                      <th>Счёт</th>
                      <th>Баланс</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.virtual_accounts.map((va) => (
                      <tr key={va.code}>
                        <td className="code-cell">{va.code.slice(0, 12)}...</td>
                        <td className="amount-cell">{formatMoney(va.cash)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Закрыть
            </button>
            <button className="btn btn-primary" onClick={onSuccess}>
              Обновить детали
            </button>
          </div>

          <style jsx>{`
            .success-message {
              text-align: center;
              padding: 24px;
            }

            .success-icon {
              color: var(--color-success);
              margin-bottom: 16px;
            }

            .success-message p {
              font-size: 16px;
              font-weight: 500;
              margin: 0;
            }

            .result-section {
              margin-top: 16px;
            }

            .result-section h4 {
              font-size: 14px;
              font-weight: 600;
              margin: 0 0 12px 0;
            }

            .result-table {
              width: 100%;
              border-collapse: collapse;
            }

            .result-table th,
            .result-table td {
              padding: 8px 12px;
              text-align: left;
              border-bottom: 1px solid var(--border-color);
            }

            .result-table th {
              font-size: 12px;
              font-weight: 500;
              color: var(--text-secondary);
            }

            .code-cell {
              font-family: monospace;
              font-size: 13px;
            }

            .amount-cell {
              font-weight: 500;
              color: var(--color-success);
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Идентификация платежа</h3>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {/* Payment info */}
          <div className="payment-info">
            <div className="info-row">
              <span>Сумма платежа:</span>
              <span className="money money-positive">{formatMoney(paymentAmount)}</span>
            </div>
            {payment.payer_name && (
              <div className="info-row">
                <span>Плательщик:</span>
                <span>{payment.payer_name}</span>
              </div>
            )}
            {payment.purpose && (
              <div className="info-row">
                <span>Назначение:</span>
                <span className="purpose-text">{payment.purpose}</span>
              </div>
            )}
          </div>

          <div className="offer-warning">
            <strong>Важно:</strong> для идентификации нужен договор оферты.
          </div>

          {/* No standard accounts warning */}
          {standardAccounts.length === 0 && (
            <div className="warning-box">
              <p>Нет доступных виртуальных счетов типа standard.</p>
              <a href="/virtual-accounts" className="btn btn-sm btn-secondary">
                Перейти к Virtual Accounts
              </a>
            </div>
          )}

          {/* Owners list */}
          {standardAccounts.length > 0 && (
            <>
              <div className="owners-header">
                <h4>Распределение по виртуальным счетам</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={addOwner}
                >
                  + Добавить
                </button>
              </div>

              <div className="owners-list">
                {owners.map((owner, index) => (
                  <div key={index} className="owner-row">
                    <div className="form-group owner-account">
                      <label className="form-label">Виртуальный счёт</label>
                      <select
                        className="form-input form-select"
                        value={owner.virtual_account}
                        onChange={(e) => updateOwner(index, 'virtual_account', e.target.value)}
                      >
                        <option value="">Выберите счёт</option>
                        {standardAccounts.map((va) => (
                          <option key={va.virtual_account_id} value={va.virtual_account_id}>
                            {va.virtual_account_id.slice(0, 12)}...
                            {va.beneficiary_inn && ` (ИНН: ${va.beneficiary_inn})`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group owner-amount">
                      <label className="form-label">Сумма</label>
                      <input
                        type="number"
                        className="form-input"
                        step="0.01"
                        min="0.01"
                        placeholder="0.00"
                        value={owner.amount}
                        onChange={(e) => updateOwner(index, 'amount', e.target.value)}
                      />
                    </div>

                    {owners.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger owner-remove"
                        onClick={() => removeOwner(index)}
                        title="Удалить"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Amount summary */}
              <div className="amount-summary">
                <div className="summary-row">
                  <span>Сумма платежа:</span>
                  <span>{formatMoney(paymentAmount)}</span>
                </div>
                <div className="summary-row">
                  <span>Распределено:</span>
                  <span className={paymentAmount !== null && getTotalAmount() === paymentAmount ? 'match' : 'mismatch'}>
                    {formatMoney(getTotalAmount())}
                  </span>
                </div>
                {Math.abs(getRemainingAmount()) > 0.01 && (
                  <div className="summary-row remaining">
                    <span>Остаток:</span>
                    <span className="mismatch">{formatMoney(getRemainingAmount())}</span>
                  </div>
                )}
              </div>

              {/* Is returned payment checkbox */}
              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isReturnedPayment}
                    onChange={(e) => setIsReturnedPayment(e.target.checked)}
                  />
                  <span>Это возвращённый платёж (is_returned_payment)</span>
                </label>
                <p className="form-hint">
                  Отметьте, если идентифицируете ранее возвращённый платёж
                </p>
              </div>
            </>
          )}

          {/* Validation error */}
          {validationError && (
            <div className="validation-error">
              {validationError}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-box">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
            Отмена
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || standardAccounts.length === 0 || !!validationError}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                Идентификация...
              </>
            ) : (
              'Идентифицировать'
            )}
          </button>
        </div>

        <style jsx>{`
          .modal-large {
            max-width: 600px;
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

          .purpose-text {
            max-width: 300px;
            text-align: right;
            word-break: break-word;
          }

          .warning-box {
            padding: 16px;
            background: var(--color-warning-bg);
            border-radius: 8px;
            text-align: center;
          }

          .warning-box p {
            margin: 0 0 12px 0;
            color: var(--color-warning);
          }

          .offer-warning {
            padding: 12px 16px;
            border-radius: 8px;
            background: var(--color-warning-bg);
            color: var(--color-warning);
            font-size: 13px;
            margin-bottom: 16px;
          }

          .offer-warning strong {
            margin-right: 6px;
          }

          .owners-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }

          .owners-header h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
          }

          .owners-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
          }

          .owner-row {
            display: flex;
            gap: 12px;
            align-items: flex-end;
          }

          .owner-account {
            flex: 2;
          }

          .owner-amount {
            flex: 1;
            min-width: 120px;
          }

          .owner-remove {
            margin-bottom: 4px;
            padding: 8px 12px;
          }

          .amount-summary {
            padding: 12px 16px;
            background: var(--bg-tertiary);
            border-radius: 8px;
            margin-bottom: 16px;
          }

          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: 14px;
          }

          .summary-row .match {
            color: var(--color-success);
            font-weight: 500;
          }

          .summary-row .mismatch {
            color: var(--color-error);
            font-weight: 500;
          }

          .summary-row.remaining {
            border-top: 1px solid var(--border-color);
            margin-top: 8px;
            padding-top: 8px;
          }

          .checkbox-group {
            margin-top: 16px;
          }

          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 14px;
          }

          .checkbox-label input {
            width: 18px;
            height: 18px;
          }

          .validation-error {
            padding: 12px;
            background: var(--color-warning-bg);
            color: var(--color-warning);
            border-radius: 8px;
            font-size: 14px;
            margin-top: 12px;
          }

          .error-box {
            padding: 12px;
            background: var(--color-error-bg, rgba(239, 68, 68, 0.1));
            color: var(--color-error, #ef4444);
            border-radius: 8px;
            font-size: 14px;
            margin-top: 12px;
            white-space: pre-line;
          }

          @media (max-width: 600px) {
            .owner-row {
              flex-wrap: wrap;
            }

            .owner-account {
              flex: 1 1 100%;
            }

            .owner-amount {
              flex: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
