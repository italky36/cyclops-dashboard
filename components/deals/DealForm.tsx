'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CreateDealParams,
  DealRecipient,
  RecipientType,
  ComplianceCheckPayment,
} from '@/types/cyclops/deals';
import { generateRecipientNumber, validateDealAmounts } from '@/lib/utils/deals';

const ALLOWED_TEXT_REGEX = /^[ -~№А-яёЁ\t\n\r]*$/;

const RECIPIENT_TYPES: Array<{ value: RecipientType; label: string }> = [
  { value: 'payment_contract', label: 'Оплата по договору' },
  { value: 'commission', label: 'Комиссия' },
  { value: 'payment_contract_by_sbp', label: 'СБП (v1)' },
  { value: 'payment_contract_by_sbp_v2', label: 'СБП (по телефону)' },
  { value: 'payment_contract_to_card', label: 'На карту' },
  { value: 'ndfl_to_virtual_account', label: 'Сбор на налоги (ВС)' },
];

type PayerInput = { virtual_account: string; amount: number };
type RecipientInput = DealRecipient & { _card_number_plain?: string };
type PaymentContractRecipientInput = Extract<RecipientInput, { type: 'payment_contract' }>;
type CommissionRecipientInput = Extract<RecipientInput, { type: 'commission' }>;
type SbpRecipientInput = Extract<
  RecipientInput,
  { type: 'payment_contract_by_sbp' | 'payment_contract_by_sbp_v2' }
>;
type CardRecipientInput = Extract<RecipientInput, { type: 'payment_contract_to_card' }>;

interface DealFormProps {
  initialData?: CreateDealParams;
  onSubmit: (data: CreateDealParams) => Promise<{ compliance_check_payments?: ComplianceCheckPayment[] }>;
  submitLabel: string;
}

interface VirtualAccountOption {
  id: string;
  balance?: number;
  type?: string;
}

interface SbpBankOption {
  id: string;
  name: string;
}

const parseVirtualAccounts = (data: unknown): VirtualAccountOption[] => {
  if (!data || typeof data !== 'object') return [];
  const root = data as { virtual_accounts?: unknown[] };
  if (!Array.isArray(root.virtual_accounts)) return [];
  return root.virtual_accounts
    .map((item) => {
      if (typeof item === 'string') return { id: item };
      if (item && typeof item === 'object') {
        const record = item as { id?: string; virtual_account?: string; balance?: number; type?: string; cash?: number };
        const id = record.id || record.virtual_account;
        if (!id) return null;
        return {
          id,
          balance: typeof record.balance === 'number' ? record.balance : record.cash,
          type: record.type,
        };
      }
      return null;
    })
    .filter(Boolean) as VirtualAccountOption[];
};

const parseSbpBanks = (data: unknown): SbpBankOption[] => {
  if (!data || typeof data !== 'object') return [];
  const root = data as { banks?: unknown[]; result?: unknown };
  if (Array.isArray(root.banks)) {
    return root.banks
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as { id?: string; bank_sbp_id?: string; name?: string };
        const id = record.id || record.bank_sbp_id;
        if (!id || !record.name) return null;
        return { id, name: record.name };
      })
      .filter(Boolean) as SbpBankOption[];
  }
  if (Array.isArray(root.result)) {
    return root.result
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const record = item as { id?: string; bank_sbp_id?: string; name?: string };
        const id = record.id || record.bank_sbp_id;
        if (!id || !record.name) return null;
        return { id, name: record.name };
      })
      .filter(Boolean) as SbpBankOption[];
  }
  return [];
};

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

const formatCardNumber = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  const parts = digits.match(/.{1,4}/g) || [];
  return parts.join(' ');
};

const normalizeCardNumber = (value: string) => value.replace(/\D/g, '').slice(0, 16);

const isValidText = (value: string) => ALLOWED_TEXT_REGEX.test(value);

const ensureAllowedText = (value: string, label: string): string | null => {
  if (!value) return null;
  if (!isValidText(value)) {
    return `Поле "${label}" содержит недопустимые символы`;
  }
  return null;
};

async function encryptCardNumber(cardNumber: string): Promise<string> {
  const response = await fetch('/api/encrypt-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_number: cardNumber }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || 'Ошибка шифрования номера карты');
  }
  return data.card_number_crypto_base64 || data.card_number_crypto || data.encrypted || '';
}

function PayerField({
  payer,
  index,
  onChange,
  onRemove,
  canRemove,
  virtualAccounts,
}: {
  payer: PayerInput;
  index: number;
  onChange: (index: number, payer: PayerInput) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
  virtualAccounts: VirtualAccountOption[];
}) {
  const [query, setQuery] = useState('');
  const filteredAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return virtualAccounts;
    return virtualAccounts.filter((va) => va.id.toLowerCase().includes(needle));
  }, [query, virtualAccounts]);

  return (
    <div className="deal-form-item">
      <div className="deal-form-grid deal-form-grid-payer">
        <div className="form-group">
          <label className="form-label">Виртуальный счёт *</label>
          <input
            type="text"
            className="form-input"
            placeholder="Поиск по счёту"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="form-input form-select"
            value={payer.virtual_account}
            onChange={(event) => onChange(index, { ...payer, virtual_account: event.target.value })}
            required
          >
            <option value="">Выберите счёт</option>
            {filteredAccounts.map((va) => (
              <option key={va.id} value={va.id}>
                {va.id.slice(0, 8)}...
                {typeof va.balance === 'number'
                  ? ` (баланс: ${va.balance.toLocaleString('ru-RU')} ₽)`
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Сумма *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="form-input"
            value={payer.amount || ''}
            onChange={(event) => onChange(index, { ...payer, amount: Number(event.target.value) || 0 })}
            required
          />
        </div>

        <div className="form-group deal-form-actions">
          {canRemove ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(index)}>
              Удалить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PaymentContractFields({
  recipient,
  onChange,
}: {
  recipient: PaymentContractRecipientInput;
  onChange: (updates: Partial<PaymentContractRecipientInput>) => void;
}) {
  return (
    <div className="stack stack-sm">
      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">Счёт получателя *</label>
          <input
            type="text"
            className="form-input"
            placeholder="20 цифр"
            value={recipient.account || ''}
            maxLength={20}
            onChange={(event) => onChange({ account: event.target.value.replace(/\D/g, '').slice(0, 20) })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">БИК *</label>
          <input
            type="text"
            className="form-input"
            placeholder="9 цифр"
            value={recipient.bank_code || ''}
            maxLength={9}
            onChange={(event) => onChange({ bank_code: event.target.value.replace(/\D/g, '').slice(0, 9) })}
            required
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Наименование *</label>
        <input
          type="text"
          className="form-input"
          value={recipient.name || ''}
          onChange={(event) => onChange({ name: event.target.value })}
          required
        />
      </div>

      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">ИНН *</label>
          <input
            type="text"
            className="form-input"
            placeholder="10 или 12 цифр"
            value={recipient.inn || ''}
            maxLength={12}
            onChange={(event) => onChange({ inn: event.target.value.replace(/\D/g, '').slice(0, 12) })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">КПП</label>
          <input
            type="text"
            className="form-input"
            placeholder="9 цифр"
            value={recipient.kpp || ''}
            maxLength={9}
            onChange={(event) => onChange({ kpp: event.target.value.replace(/\D/g, '').slice(0, 9) })}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Назначение платежа</label>
        <textarea
          className="form-input form-textarea"
          value={recipient.purpose || ''}
          onChange={(event) => onChange({ purpose: event.target.value })}
          rows={2}
        />
      </div>

      <div className="form-group">
        <label className="form-label">НДС %</label>
        <input
          type="number"
          className="form-input"
          placeholder="0"
          value={recipient.purpose_nds ?? ''}
          onChange={(event) => onChange({ purpose_nds: Number(event.target.value) || undefined })}
        />
      </div>
    </div>
  );
}

function CommissionFields({
  recipient,
  onChange,
}: {
  recipient: CommissionRecipientInput;
  onChange: (updates: Partial<CommissionRecipientInput>) => void;
}) {
  const [useCustomPurpose, setUseCustomPurpose] = useState(Boolean(recipient.purpose));

  return (
    <div className="stack stack-sm">
      <div className="form-group">
        <label className="form-label">Наименование *</label>
        <input
          type="text"
          className="form-input"
          value={recipient.name || ''}
          onChange={(event) => onChange({ name: event.target.value })}
          required
        />
      </div>

      <label className="form-checkbox">
        <input
          type="checkbox"
          checked={useCustomPurpose}
          onChange={(event) => {
            setUseCustomPurpose(event.target.checked);
            if (!event.target.checked) {
              onChange({ purpose: undefined });
            }
          }}
        />
        <span>Указать своё назначение платежа</span>
      </label>

      {useCustomPurpose ? (
        <div className="form-group">
          <label className="form-label">Назначение платежа</label>
          <textarea
            className="form-input form-textarea"
            rows={2}
            value={recipient.purpose || ''}
            onChange={(event) => onChange({ purpose: event.target.value })}
            placeholder="Укажите назначение с информацией о НДС"
          />
        </div>
      ) : (
        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">НДС %</label>
            <input
              type="number"
              className="form-input"
              value={recipient.purpose_nds ?? ''}
              onChange={(event) => onChange({ purpose_nds: Number(event.target.value) || undefined })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Тип назначения</label>
            <select
              className="form-input form-select"
              value={recipient.purpose_type || 'standard'}
              onChange={(event) =>
                onChange({ purpose_type: event.target.value as CommissionRecipientInput['purpose_type'] })
              }
            >
              <option value="standard">Стандартное</option>
              <option value="with_inn">С ИНН плательщика</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

function SbpFields({
  recipient,
  onChange,
  sbpBanks,
}: {
  recipient: SbpRecipientInput;
  onChange: (updates: Partial<SbpRecipientInput>) => void;
  sbpBanks: SbpBankOption[];
}) {
  const [query, setQuery] = useState('');
  const filteredBanks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sbpBanks;
    return sbpBanks.filter((bank) => bank.name.toLowerCase().includes(needle) || bank.id.includes(needle));
  }, [query, sbpBanks]);

  return (
    <div className="stack stack-sm">
      <div className="grid grid-3">
        <div className="form-group">
          <label className="form-label">Фамилия *</label>
          <input
            type="text"
            className="form-input"
            value={recipient.last_name || ''}
            onChange={(event) => onChange({ last_name: event.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Имя *</label>
          <input
            type="text"
            className="form-input"
            value={recipient.first_name || ''}
            onChange={(event) => onChange({ first_name: event.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Отчество</label>
          <input
            type="text"
            className="form-input"
            value={recipient.middle_name || ''}
            onChange={(event) => onChange({ middle_name: event.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-2">
        <div className="form-group">
          <label className="form-label">Телефон *</label>
          <input
            type="text"
            className="form-input"
            placeholder="+7 ___ ___ __ __"
            value={recipient.phone_number ? formatPhone(recipient.phone_number) : ''}
            onChange={(event) => onChange({ phone_number: normalizePhone(event.target.value) })}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label">Банк СБП *</label>
          <input
            type="text"
            className="form-input"
            placeholder="Поиск по банку"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="form-input form-select"
            value={recipient.bank_sbp_id || ''}
            onChange={(event) => onChange({ bank_sbp_id: event.target.value })}
            required
          >
            <option value="">Выберите банк</option>
            {filteredBanks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Назначение платежа (до 140 символов)</label>
        <textarea
          className="form-input form-textarea"
          maxLength={140}
          rows={2}
          value={recipient.purpose || ''}
          onChange={(event) => onChange({ purpose: event.target.value.slice(0, 140) })}
        />
      </div>
    </div>
  );
}

function CardFields({
  recipient,
  onChange,
}: {
  recipient: CardRecipientInput;
  onChange: (updates: Partial<CardRecipientInput>) => void;
}) {
  const [cardNumber, setCardNumber] = useState(recipient._card_number_plain || '');
  const hasEncrypted = Boolean(recipient.card_number_crypto_base64);

  return (
    <div className="stack stack-sm">
      <div className="form-group">
        <label className="form-label">Номер карты *</label>
        <input
          type="text"
          className="form-input"
          placeholder="0000 0000 0000 0000"
          value={formatCardNumber(cardNumber)}
          onChange={(event) => {
            const normalized = normalizeCardNumber(event.target.value);
            setCardNumber(normalized);
            onChange({ _card_number_plain: normalized });
          }}
          required={!hasEncrypted}
        />
        <span className="form-hint">Номер карты будет зашифрован перед отправкой</span>
        {hasEncrypted ? (
          <span className="form-hint">Оставьте поле пустым, чтобы сохранить текущий номер</span>
        ) : null}
      </div>

      <div className="form-group">
        <label className="form-label">Назначение платежа (до 210 символов)</label>
        <textarea
          className="form-input form-textarea"
          maxLength={210}
          rows={2}
          value={recipient.purpose || ''}
          onChange={(event) => onChange({ purpose: event.target.value.slice(0, 210) })}
        />
      </div>
    </div>
  );
}

function RecipientField({
  recipient,
  index,
  onChange,
  onRemove,
  sbpBanks,
  virtualAccountsForNdfl,
}: {
  recipient: RecipientInput;
  index: number;
  onChange: (index: number, recipient: RecipientInput) => void;
  onRemove: (index: number) => void;
  sbpBanks: SbpBankOption[];
  virtualAccountsForNdfl: VirtualAccountOption[];
}) {
  const handleTypeChange = (newType: RecipientType) => {
    onChange(index, {
      type: newType,
      number: recipient.number,
      amount: recipient.amount,
    } as RecipientInput);
  };

  const handleFieldChange = (updates: Partial<RecipientInput>) => {
    onChange(index, { ...recipient, ...updates } as RecipientInput);
  };

  return (
    <div className="deal-form-item deal-form-item-recipient">
      <div className="deal-form-item-header">
        <div className="deal-form-item-title">Получатель #{recipient.number}</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(index)}>
          Удалить
        </button>
      </div>

      <div className="grid grid-3">
        <div className="form-group">
          <label className="form-label">Тип получателя *</label>
          <select
            className="form-input form-select"
            value={recipient.type}
            onChange={(event) => handleTypeChange(event.target.value as RecipientType)}
            required
          >
            {RECIPIENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Номер *</label>
          <input type="text" className="form-input" value={recipient.number} readOnly />
        </div>

        <div className="form-group">
          <label className="form-label">Сумма *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="form-input"
            value={recipient.amount || ''}
            onChange={(event) => handleFieldChange({ amount: Number(event.target.value) || 0 })}
            required
          />
        </div>
      </div>

      {recipient.type === 'payment_contract' ? (
        <PaymentContractFields recipient={recipient} onChange={handleFieldChange} />
      ) : null}

      {recipient.type === 'commission' ? (
        <CommissionFields recipient={recipient} onChange={handleFieldChange} />
      ) : null}

      {recipient.type === 'payment_contract_by_sbp' || recipient.type === 'payment_contract_by_sbp_v2' ? (
        <SbpFields recipient={recipient} onChange={handleFieldChange} sbpBanks={sbpBanks} />
      ) : null}

      {recipient.type === 'payment_contract_to_card' ? (
        <CardFields recipient={recipient} onChange={handleFieldChange} />
      ) : null}

      {recipient.type === 'ndfl_to_virtual_account' ? (
        <div className="form-group">
          <label className="form-label">Виртуальный счёт (for_ndfl) *</label>
          <select
            className="form-input form-select"
            value={(recipient as DealRecipient & { virtual_account?: string }).virtual_account || ''}
            onChange={(event) => handleFieldChange({ virtual_account: event.target.value })}
            required
          >
            <option value="">Выберите счёт</option>
            {virtualAccountsForNdfl.map((va) => (
              <option key={va.id} value={va.id}>
                {va.id}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function DealForm({ initialData, onSubmit, submitLabel }: DealFormProps) {
  const router = useRouter();

  const [extKey, setExtKey] = useState(initialData?.ext_key || '');
  const [payers, setPayers] = useState<PayerInput[]>(initialData?.payers || [
    { virtual_account: '', amount: 0 },
  ]);
  const [recipients, setRecipients] = useState<RecipientInput[]>(initialData?.recipients || [
    { type: 'payment_contract', number: 1, amount: 0 } as RecipientInput,
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complianceWarning, setComplianceWarning] = useState<ComplianceCheckPayment[] | null>(null);

  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountOption[]>([]);
  const [virtualAccountsForNdfl, setVirtualAccountsForNdfl] = useState<VirtualAccountOption[]>([]);
  const [sbpBanks, setSbpBanks] = useState<SbpBankOption[]>([]);

  useEffect(() => {
    const loadReferenceData = async () => {
      try {
        const [accountsRes, ndflRes, banksRes] = await Promise.all([
          fetch('/api/virtual-accounts?type=standard'),
          fetch('/api/virtual-accounts?type=for_ndfl'),
          fetch('/api/sbp-banks'),
        ]);
        const [accountsData, ndflData, banksData] = await Promise.all([
          accountsRes.ok ? accountsRes.json() : null,
          ndflRes.ok ? ndflRes.json() : null,
          banksRes.ok ? banksRes.json() : null,
        ]);
        if (accountsData) {
          setVirtualAccounts(parseVirtualAccounts(accountsData));
        }
        if (ndflData) {
          setVirtualAccountsForNdfl(parseVirtualAccounts(ndflData));
        }
        if (banksData) {
          setSbpBanks(parseSbpBanks(banksData));
        }
      } catch (loadError) {
        console.error('Failed to load reference data', loadError);
      }
    };

    loadReferenceData();
  }, []);

  const totalAmount = useMemo(
    () => recipients.reduce((sum, recipient) => sum + (recipient.amount || 0), 0),
    [recipients]
  );
  const payersTotal = useMemo(
    () => payers.reduce((sum, payer) => sum + (payer.amount || 0), 0),
    [payers]
  );

  const addPayer = () => {
    setPayers((prev) => [...prev, { virtual_account: '', amount: 0 }]);
  };

  const removePayer = (index: number) => {
    setPayers((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePayer = (index: number, payer: PayerInput) => {
    setPayers((prev) => prev.map((item, i) => (i === index ? payer : item)));
  };

  const addRecipient = () => {
    setRecipients((prev) => {
      const numbers = prev.map((recipient) => recipient.number);
      const newNumber = generateRecipientNumber(numbers);
      return [...prev, { type: 'payment_contract', number: newNumber, amount: 0 } as RecipientInput];
    });
  };

  const removeRecipient = (index: number) => {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecipient = (index: number, recipient: RecipientInput) => {
    setRecipients((prev) => prev.map((item, i) => (i === index ? recipient : item)));
  };

  const validateForm = async (): Promise<string | null> => {
    if (extKey) {
      const message = ensureAllowedText(extKey, 'Внешний ключ');
      if (message) return message;
    }

    if (payers.length === 0) return 'Добавьте хотя бы одного плательщика';
    for (let index = 0; index < payers.length; index += 1) {
      const payer = payers[index];
      if (!payer.virtual_account) return `Выберите виртуальный счёт для плательщика #${index + 1}`;
      if (!payer.amount || payer.amount <= 0) return `Укажите сумму для плательщика #${index + 1}`;
    }

    const numbers = recipients.map((recipient) => recipient.number);
    if (new Set(numbers).size !== numbers.length) {
      return 'Номера получателей должны быть уникальными';
    }

    for (const recipient of recipients) {
      if (!recipient.amount || recipient.amount <= 0) {
        return `Укажите сумму для получателя #${recipient.number}`;
      }

      switch (recipient.type) {
        case 'payment_contract': {
          if (!recipient.account || recipient.account.length !== 20) return `Введите счёт (20 цифр) для получателя #${recipient.number}`;
          if (!recipient.bank_code || recipient.bank_code.length !== 9) return `Введите БИК (9 цифр) для получателя #${recipient.number}`;
          if (!recipient.name) return `Введите наименование для получателя #${recipient.number}`;
          if (!recipient.inn || !/^\d{10}$|^\d{12}$/.test(recipient.inn)) return `Введите ИНН (10 или 12 цифр) для получателя #${recipient.number}`;
          if (recipient.kpp && !/^\d{9}$/.test(recipient.kpp)) return `КПП должен быть 9 цифр для получателя #${recipient.number}`;
          if (recipient.purpose && recipient.purpose.length > 210) return `Назначение платежа до 210 символов (получатель #${recipient.number})`;
          if (recipient.purpose_nds !== undefined && (recipient.purpose_nds < 0 || recipient.purpose_nds > 100)) {
            return `НДС должен быть от 0 до 100 (получатель #${recipient.number})`;
          }
          const nameError = ensureAllowedText(recipient.name, 'Наименование');
          if (nameError) return `${nameError} (получатель #${recipient.number})`;
          if (recipient.purpose) {
            const purposeError = ensureAllowedText(recipient.purpose, 'Назначение платежа');
            if (purposeError) return `${purposeError} (получатель #${recipient.number})`;
          }
          break;
        }
        case 'commission': {
          if (!recipient.name) return `Введите наименование для получателя #${recipient.number}`;
          const nameError = ensureAllowedText(recipient.name, 'Наименование');
          if (nameError) return `${nameError} (получатель #${recipient.number})`;
          if (!recipient.purpose && recipient.purpose_nds === undefined) {
            return `Укажите назначение или НДС для получателя #${recipient.number}`;
          }
          if (recipient.purpose && recipient.purpose.length > 210) {
            return `Назначение платежа до 210 символов (получатель #${recipient.number})`;
          }
          if (recipient.purpose) {
            const purposeError = ensureAllowedText(recipient.purpose, 'Назначение платежа');
            if (purposeError) return `${purposeError} (получатель #${recipient.number})`;
          }
          if (recipient.purpose_nds !== undefined && (recipient.purpose_nds < 0 || recipient.purpose_nds > 100)) {
            return `НДС должен быть от 0 до 100 (получатель #${recipient.number})`;
          }
          break;
        }
        case 'payment_contract_by_sbp':
        case 'payment_contract_by_sbp_v2': {
          if (!recipient.first_name) return `Введите имя для получателя #${recipient.number}`;
          if (!recipient.last_name) return `Введите фамилию для получателя #${recipient.number}`;
          if (!recipient.phone_number || !/^7\d{10}$/.test(recipient.phone_number)) {
            return `Телефон должен содержать 11 цифр и начинаться с 7 (получатель #${recipient.number})`;
          }
          if (!recipient.bank_sbp_id) return `Выберите банк СБП для получателя #${recipient.number}`;
          if (recipient.purpose && recipient.purpose.length > 140) {
            return `Назначение платежа до 140 символов (получатель #${recipient.number})`;
          }
          if (recipient.purpose_nds !== undefined && (recipient.purpose_nds < 0 || recipient.purpose_nds > 100)) {
            return `НДС должен быть от 0 до 100 (получатель #${recipient.number})`;
          }
          if (recipient.inn && !/^\d{12}$/.test(recipient.inn)) {
            return `ИНН должен содержать 12 цифр (получатель #${recipient.number})`;
          }
          const firstNameError = ensureAllowedText(recipient.first_name, 'Имя');
          if (firstNameError) return `${firstNameError} (получатель #${recipient.number})`;
          const lastNameError = ensureAllowedText(recipient.last_name, 'Фамилия');
          if (lastNameError) return `${lastNameError} (получатель #${recipient.number})`;
          if (recipient.middle_name) {
            const middleNameError = ensureAllowedText(recipient.middle_name, 'Отчество');
            if (middleNameError) return `${middleNameError} (получатель #${recipient.number})`;
          }
          if (recipient.purpose) {
            const purposeError = ensureAllowedText(recipient.purpose, 'Назначение платежа');
            if (purposeError) return `${purposeError} (получатель #${recipient.number})`;
          }
          break;
        }
        case 'payment_contract_to_card': {
          const existingEncrypted = recipient.card_number_crypto_base64;
          if (recipient._card_number_plain) {
            if (recipient._card_number_plain.length !== 16) {
              return `Введите номер карты (16 цифр) для получателя #${recipient.number}`;
            }
          } else if (!existingEncrypted) {
            return `Введите номер карты (16 цифр) для получателя #${recipient.number}`;
          }
          if (recipient.purpose && recipient.purpose.length > 210) {
            return `Назначение платежа до 210 символов (получатель #${recipient.number})`;
          }
          if (recipient.inn && !/^\d{12}$/.test(recipient.inn)) {
            return `ИНН должен содержать 12 цифр (получатель #${recipient.number})`;
          }
          if (recipient.purpose) {
            const purposeError = ensureAllowedText(recipient.purpose, 'Назначение платежа');
            if (purposeError) return `${purposeError} (получатель #${recipient.number})`;
          }
          break;
        }
        case 'ndfl_to_virtual_account': {
          if (!(recipient as DealRecipient & { virtual_account?: string }).virtual_account) {
            return `Выберите виртуальный счёт для получателя #${recipient.number}`;
          }
          break;
        }
        default:
          break;
      }
    }

    const amountValidation = validateDealAmounts(totalAmount, payers, recipients);
    if (!amountValidation.valid) return amountValidation.error || 'Ошибка в суммах сделки';

    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setComplianceWarning(null);

    const validationError = await validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const preparedRecipients: DealRecipient[] = [];

      for (const recipient of recipients) {
        if (recipient.type === 'payment_contract_to_card') {
          const { _card_number_plain, ...rest } = recipient;
          const existingEncrypted = recipient.card_number_crypto_base64;
          const encrypted = _card_number_plain
            ? await encryptCardNumber(_card_number_plain)
            : existingEncrypted || '';
          preparedRecipients.push({
            ...rest,
            card_number_crypto_base64: encrypted,
          });
        } else {
          const { _card_number_plain: ignoredCardNumber, ...rest } = recipient;
          void ignoredCardNumber;
          preparedRecipients.push(rest as DealRecipient);
        }
      }

      const payload: CreateDealParams = {
        amount: totalAmount,
        payers: payers.map((payer) => ({
          virtual_account: payer.virtual_account,
          amount: payer.amount,
        })),
        recipients: preparedRecipients,
      };

      if (extKey) {
        payload.ext_key = extKey;
      }

      const result = await onSubmit(payload);
      const warnings = result?.compliance_check_payments;
      if (warnings && warnings.some((item) => !item.approved)) {
        setComplianceWarning(warnings);
        return;
      }

      router.push('/deals');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="deal-form stack stack-lg">
      {error ? (
        <div className="deal-form-banner deal-form-banner-error">
          <span>{error}</span>
        </div>
      ) : null}

      {complianceWarning ? (
        <div className="deal-form-banner deal-form-banner-warning">
          <div className="deal-form-banner-title">Предупреждение комплаенс-службы</div>
          {complianceWarning.filter((item) => !item.approved).map((item) => (
            <div key={item.number} className="deal-form-warning-item">
              <div className="deal-form-warning-title">Получатель #{item.number}:</div>
              {item.messages.map((message, index) => (
                <div key={index} className="deal-form-warning-text">
                  [{message.level}] {message.text}
                </div>
              ))}
            </div>
          ))}
          <div className="deal-form-warning-actions">
            <button type="button" className="btn btn-secondary" onClick={() => router.push('/deals')}>
              Продолжить
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setComplianceWarning(null)}>
              Остаться на форме
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Основные данные</h2>
        </div>
        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Внешний ключ (ext_key)</label>
            <input
              type="text"
              className="form-input"
              value={extKey}
              onChange={(event) => setExtKey(event.target.value)}
              placeholder="Опционально"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Общая сумма</label>
            <input
              type="text"
              className="form-input"
              value={`${totalAmount.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽`}
              readOnly
            />
            {Math.abs(payersTotal - totalAmount) > 0.01 ? (
              <div className="form-error">
                Сумма плательщиков ({payersTotal.toFixed(2)}) не равна сумме получателей
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Плательщики</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addPayer}>
            + Добавить плательщика
          </button>
        </div>
        <div className="stack stack-sm">
          {payers.map((payer, index) => (
            <PayerField
              key={`payer-${index}`}
              payer={payer}
              index={index}
              onChange={updatePayer}
              onRemove={removePayer}
              canRemove={payers.length > 1}
              virtualAccounts={virtualAccounts}
            />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Получатели</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addRecipient}>
            + Добавить получателя
          </button>
        </div>
        <div className="stack stack-sm">
          {recipients.map((recipient, index) => (
            <RecipientField
              key={`recipient-${recipient.number}`}
              recipient={recipient}
              index={index}
              onChange={updateRecipient}
              onRemove={removeRecipient}
              sbpBanks={sbpBanks}
              virtualAccountsForNdfl={virtualAccountsForNdfl}
            />
          ))}
        </div>
      </div>

      <div className="deal-form-actions">
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Сохранение...' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => router.push('/deals')}>
          Отмена
        </button>
      </div>

      <style jsx>{`
        .deal-form {
          max-width: 1100px;
        }

        .deal-form-banner {
          padding: 16px 18px;
          border-radius: 12px;
          font-size: 14px;
        }

        .deal-form-banner-error {
          background: var(--color-error-bg);
          color: var(--color-error);
        }

        .deal-form-banner-warning {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .deal-form-banner-title {
          font-weight: 600;
          margin-bottom: 8px;
        }

        .deal-form-warning-item + .deal-form-warning-item {
          margin-top: 10px;
        }

        .deal-form-warning-title {
          font-weight: 600;
          margin-bottom: 4px;
        }

        .deal-form-warning-text {
          font-size: 13px;
        }

        .deal-form-warning-actions {
          display: flex;
          gap: 12px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .deal-form-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .deal-form-item {
          padding: 16px;
          border-radius: 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
        }

        .deal-form-item-recipient {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .deal-form-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .deal-form-item-title {
          font-weight: 600;
        }

        .deal-form-grid {
          display: grid;
          gap: 16px;
        }

        .deal-form-grid-payer {
          grid-template-columns: 2fr 1fr auto;
          align-items: end;
        }

        .deal-form-actions {
          display: flex;
          gap: 12px;
        }

        @media (max-width: 767px) {
          .deal-form-grid-payer {
            grid-template-columns: 1fr;
          }

          .deal-form-actions {
            flex-direction: column;
          }

          .deal-form-actions .btn {
            width: 100%;
          }
        }
      `}</style>
    </form>
  );
}
