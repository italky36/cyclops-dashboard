'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';

type PayoutType = 'payment_contract' | 'payment_contract_by_sbp_v2' | 'payment_contract_to_card';

const PAYOUT_TYPES: Array<{ value: PayoutType; label: string; description: string }> = [
  { value: 'payment_contract', label: 'Банковский перевод', description: 'На расчётный счёт (р/с + БИК + ИНН)' },
  { value: 'payment_contract_by_sbp_v2', label: 'СБП', description: 'По номеру телефона через Систему быстрых платежей' },
  { value: 'payment_contract_to_card', label: 'На карту', description: 'Перевод на банковскую карту' },
];

export default function CreateClientPage() {
  const router = useRouter();
  const addRecentAction = useAppStore((s) => s.addRecentAction);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Основные данные
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');

  // Тип выплаты
  const [payoutType, setPayoutType] = useState<PayoutType>('payment_contract');

  // Реквизиты банковского перевода
  const [bankAccount, setBankAccount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [inn, setInn] = useState('');
  const [kpp, setKpp] = useState('');
  const [recipientName, setRecipientName] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        name,
        contact_name: contactName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        notes: notes || undefined,
        beneficiary_id: beneficiaryId || undefined,
        payout_type: payoutType,
      };

      if (payoutType === 'payment_contract') {
        body.bank_account = bankAccount;
        body.bank_code = bankCode;
        body.bank_name = bankName || undefined;
        body.inn = inn;
        body.kpp = kpp || undefined;
        body.recipient_name = recipientName || undefined;
      }

      if (payoutType === 'payment_contract_by_sbp_v2') {
        body.sbp_phone = sbpPhone;
        body.sbp_bank_id = sbpBankId;
        body.sbp_first_name = sbpFirstName;
        body.sbp_middle_name = sbpMiddleName || undefined;
        body.sbp_last_name = sbpLastName;
        body.inn = inn || undefined;
      }

      if (payoutType === 'payment_contract_to_card') {
        body.card_number_encrypted = cardNumber; // TODO: encrypt with RSA
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
      addRecentAction(`Создан клиент: ${name}`);
      router.push(`/clients/${data.client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Новый клиент</h1>
        <button onClick={() => router.back()} className="btn btn-secondary">
          Назад
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Основная информация */}
        <div className="form-section">
          <h2>Основная информация</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Наименование *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
                placeholder="ООО «Компания» или ИП Иванов"
              />
            </div>
            <div className="form-group">
              <label>Контактное лицо</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="input"
                placeholder="Иванов Иван Иванович"
              />
            </div>
            <div className="form-group">
              <label>Телефон</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input"
                placeholder="+7 (999) 123-45-67"
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="client@example.com"
              />
            </div>
            <div className="form-group full-width">
              <label>ID бенефициара Cyclops</label>
              <input
                type="text"
                value={beneficiaryId}
                onChange={(e) => setBeneficiaryId(e.target.value)}
                className="input"
                placeholder="UUID бенефициара (опционально)"
              />
            </div>
            <div className="form-group full-width">
              <label>Заметки</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input textarea"
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Тип выплаты */}
        <div className="form-section">
          <h2>Способ выплаты</h2>
          <div className="payout-type-selector">
            {PAYOUT_TYPES.map((pt) => (
              <label
                key={pt.value}
                className={`payout-type-option ${payoutType === pt.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="payout_type"
                  value={pt.value}
                  checked={payoutType === pt.value}
                  onChange={() => setPayoutType(pt.value)}
                  className="radio-hidden"
                />
                <div className="payout-type-label">{pt.label}</div>
                <div className="payout-type-desc">{pt.description}</div>
              </label>
            ))}
          </div>
        </div>

        {/* Реквизиты по типу */}
        <div className="form-section">
          <h2>Реквизиты для выплат</h2>

          {payoutType === 'payment_contract' && (
            <div className="form-grid">
              <div className="form-group">
                <label>Расчётный счёт * (20 цифр)</label>
                <input
                  type="text"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, '').slice(0, 20))}
                  required
                  className="input mono"
                  placeholder="40702810100000012345"
                  maxLength={20}
                />
              </div>
              <div className="form-group">
                <label>БИК * (9 цифр)</label>
                <input
                  type="text"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  required
                  className="input mono"
                  placeholder="044525225"
                  maxLength={9}
                />
              </div>
              <div className="form-group">
                <label>ИНН * (10 или 12 цифр)</label>
                <input
                  type="text"
                  value={inn}
                  onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  required
                  className="input mono"
                  placeholder="7707083893"
                  maxLength={12}
                />
              </div>
              <div className="form-group">
                <label>КПП (9 цифр)</label>
                <input
                  type="text"
                  value={kpp}
                  onChange={(e) => setKpp(e.target.value.replace(/\D/g, '').slice(0, 9))}
                  className="input mono"
                  placeholder="770701001"
                  maxLength={9}
                />
              </div>
              <div className="form-group">
                <label>Наименование банка</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="input"
                  placeholder="ПАО Сбербанк"
                />
              </div>
              <div className="form-group">
                <label>Наименование получателя</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="input"
                  placeholder="Если отличается от наименования клиента"
                />
              </div>
            </div>
          )}

          {payoutType === 'payment_contract_by_sbp_v2' && (
            <div className="form-grid">
              <div className="form-group">
                <label>Телефон СБП * (11 цифр, начиная с 7)</label>
                <input
                  type="text"
                  value={sbpPhone}
                  onChange={(e) => setSbpPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  required
                  className="input mono"
                  placeholder="79991234567"
                  maxLength={11}
                />
              </div>
              <div className="form-group">
                <label>ID банка СБП *</label>
                <input
                  type="text"
                  value={sbpBankId}
                  onChange={(e) => setSbpBankId(e.target.value)}
                  required
                  className="input"
                  placeholder="ID банка из списка СБП"
                />
              </div>
              <div className="form-group">
                <label>Имя *</label>
                <input
                  type="text"
                  value={sbpFirstName}
                  onChange={(e) => setSbpFirstName(e.target.value)}
                  required
                  className="input"
                  placeholder="Иван"
                />
              </div>
              <div className="form-group">
                <label>Фамилия *</label>
                <input
                  type="text"
                  value={sbpLastName}
                  onChange={(e) => setSbpLastName(e.target.value)}
                  required
                  className="input"
                  placeholder="Иванов"
                />
              </div>
              <div className="form-group">
                <label>Отчество</label>
                <input
                  type="text"
                  value={sbpMiddleName}
                  onChange={(e) => setSbpMiddleName(e.target.value)}
                  className="input"
                  placeholder="Иванович"
                />
              </div>
              <div className="form-group">
                <label>ИНН (12 цифр, опционально)</label>
                <input
                  type="text"
                  value={inn}
                  onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="input mono"
                  maxLength={12}
                />
              </div>
            </div>
          )}

          {payoutType === 'payment_contract_to_card' && (
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Номер карты * (будет зашифрован RSA OAEP)</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 19))}
                  required
                  className="input mono"
                  placeholder="4276123456781234"
                  maxLength={19}
                />
              </div>
              <div className="form-group">
                <label>Имя *</label>
                <input
                  type="text"
                  value={cardFirstName}
                  onChange={(e) => setCardFirstName(e.target.value)}
                  required
                  className="input"
                  placeholder="Иван"
                />
              </div>
              <div className="form-group">
                <label>Фамилия *</label>
                <input
                  type="text"
                  value={cardLastName}
                  onChange={(e) => setCardLastName(e.target.value)}
                  required
                  className="input"
                  placeholder="Иванов"
                />
              </div>
              <div className="form-group">
                <label>Отчество</label>
                <input
                  type="text"
                  value={cardMiddleName}
                  onChange={(e) => setCardMiddleName(e.target.value)}
                  className="input"
                />
              </div>
              <div className="form-group">
                <label>ИНН (12 цифр, опционально)</label>
                <input
                  type="text"
                  value={inn}
                  onChange={(e) => setInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="input mono"
                  maxLength={12}
                />
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" onClick={() => router.back()} className="btn btn-secondary">
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Сохранение...' : 'Создать клиента'}
          </button>
        </div>
      </form>

      <style jsx>{`
        .page-container {
          padding: 24px;
          max-width: 900px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .page-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .error-message {
          padding: 12px 16px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #dc2626);
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 20px;
        }
        .form-section {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 20px;
        }
        .form-section h2 {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 16px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group.full-width {
          grid-column: 1 / -1;
        }
        .form-group label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .input {
          padding: 10px 14px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }
        .input:focus {
          outline: none;
          border-color: var(--accent-color);
        }
        .input.mono {
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.5px;
        }
        .textarea {
          resize: vertical;
          min-height: 60px;
        }
        .payout-type-selector {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .payout-type-option {
          display: flex;
          flex-direction: column;
          padding: 16px;
          border: 2px solid var(--border-color);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .payout-type-option:hover {
          border-color: var(--accent-color);
        }
        .payout-type-option.selected {
          border-color: var(--accent-color);
          background: var(--accent-bg);
        }
        .radio-hidden {
          display: none;
        }
        .payout-type-label {
          font-weight: 600;
          font-size: 14px;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .payout-type-desc {
          font-size: 12px;
          color: var(--text-secondary);
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
          .page-container {
            padding: 16px;
          }
          .form-grid {
            grid-template-columns: 1fr;
          }
          .payout-type-selector {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
