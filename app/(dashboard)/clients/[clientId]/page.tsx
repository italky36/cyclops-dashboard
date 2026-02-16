'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';

interface Client {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  payout_type: string;
  bank_account: string | null;
  bank_code: string | null;
  bank_name: string | null;
  inn: string | null;
  kpp: string | null;
  recipient_name: string | null;
  payout_purpose: string | null;
  sbp_phone: string | null;
  sbp_bank_id: string | null;
  sbp_first_name: string | null;
  sbp_middle_name: string | null;
  sbp_last_name: string | null;
  card_number_encrypted: string | null;
  card_first_name: string | null;
  card_middle_name: string | null;
  card_last_name: string | null;
  beneficiary_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  commission_percent: number | null;
  payout_frequency: string | null;
  payout_exclude_days: number;
  auto_payout_enabled: boolean;
  next_payout_at: string | null;
  payout_virtual_account: string | null;
  document_filename: string | null;
  document_mime_type: string | null;
  document_uploaded_at: string | null;
}

interface Machine {
  id: number;
  vendista_id: string;
  name: string | null;
  address: string | null;
  is_active: number;
  assignment_id: number;
  commission_percent: number;
  assigned_at: string;
}

interface UnassignedMachine {
  id: number;
  vendista_id: string;
  name: string | null;
  address: string | null;
}

interface PayoutCalculation {
  client_id: number;
  client_name: string;
  period_start: string;
  period_end: string;
  machines: Array<{
    machine_id: number;
    vendista_id: string;
    machine_name: string | null;
    sales_amount: number;
    commission_percent: number;
    commission_amount: number;
    net_amount: number;
  }>;
  total_sales: number;
  total_commission: number;
  payout_amount: number;
}

interface ClientPayoutHistoryItem {
  id: number;
  client_id: number | null;
  period_start: string;
  period_end: string;
  total_sales: number;
  commission_amount: number;
  payout_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  cyclops_deal_id: string | null;
  error_message: string | null;
  created_at: string;
  executed_at: string | null;
  is_auto: number | null;
}

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  payment_contract: 'Банковский перевод',
  payment_contract_by_sbp: 'СБП',
  payment_contract_by_sbp_v2: 'СБП (v2)',
  payment_contract_to_card: 'На карту',
  none: 'Без шаблона',
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  processing: 'В процессе',
  completed: 'Выполнена',
  failed: 'Ошибка',
};

const PAYOUT_STATUS_CLASSES: Record<string, string> = {
  pending: 'badge-muted',
  processing: 'badge-info',
  completed: 'badge-success',
  failed: 'badge-danger',
};

const formatPeriodValue = (value: string) => {
  if (!value) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return isDateOnly ? parsed.toLocaleDateString('ru-RU') : parsed.toLocaleString('ru-RU');
};

type TemplatePayoutType =
  | 'payment_contract'
  | 'payment_contract_by_sbp'
  | 'payment_contract_by_sbp_v2'
  | 'payment_contract_to_card';

type SbpBank = { id: string; name: string };

const PAYOUT_TYPES: Array<{ value: TemplatePayoutType; label: string; description: string; icon: string }> = [
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

const getDefaultStartDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMonth(parsed.getMonth() - 1);
  return parsed.toISOString().split('T')[0];
};

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.clientId as string;
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);

  const [client, setClient] = useState<Client | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [unassignedMachines, setUnassignedMachines] = useState<UnassignedMachine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assign machine
  const [showAssign, setShowAssign] = useState(false);
  const [selectedMachineIds, setSelectedMachineIds] = useState<number[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [machineSearch, setMachineSearch] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Payout
  const [calculation, setCalculation] = useState<PayoutCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [payoutResult, setPayoutResult] = useState<{ success: boolean; message: string; deal_id?: string } | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [payoutHistory, setPayoutHistory] = useState<ClientPayoutHistoryItem[]>([]);
  const [dealStatuses, setDealStatuses] = useState<Record<string, string>>({});
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Auto-payout settings
  const [clientCommission, setClientCommission] = useState('');
  const [payoutFrequency, setPayoutFrequency] = useState('');
  const [excludeDays, setExcludeDays] = useState('0');
  const [autoPayoutEnabled, setAutoPayoutEnabled] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Document
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  // Template
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateMessage, setTemplateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [templateType, setTemplateType] = useState<TemplatePayoutType>('payment_contract');
  const [templateBankAccount, setTemplateBankAccount] = useState('');
  const [templateBankCode, setTemplateBankCode] = useState('');
  const [templateRecipientName, setTemplateRecipientName] = useState('');
  const [templateInn, setTemplateInn] = useState('');
  const [templateKpp, setTemplateKpp] = useState('');
  const [templatePurpose, setTemplatePurpose] = useState('');
  const [templateSbpPhone, setTemplateSbpPhone] = useState('');
  const [templateSbpBankId, setTemplateSbpBankId] = useState('');
  const [templateSbpFirstName, setTemplateSbpFirstName] = useState('');
  const [templateSbpMiddleName, setTemplateSbpMiddleName] = useState('');
  const [templateSbpLastName, setTemplateSbpLastName] = useState('');
  const [templateCardNumber, setTemplateCardNumber] = useState('');
  const [templateCardFirstName, setTemplateCardFirstName] = useState('');
  const [templateCardMiddleName, setTemplateCardMiddleName] = useState('');
  const [templateCardLastName, setTemplateCardLastName] = useState('');
  const [sbpBanks, setSbpBanks] = useState<SbpBank[]>([]);
  const [virtualAccounts, setVirtualAccounts] = useState<Array<{ id: string; balance?: number }>>([]);
  const [selectedVirtualAccount, setSelectedVirtualAccount] = useState('');

  const loadClient = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error('Ошибка загрузки клиента');
      const data = await res.json();
      setClient(data.client);
      setPayoutHistory(data.payouts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  const loadMachines = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/machines`);
      if (!res.ok) return;
      const data = await res.json();
      setMachines(data.assigned || []);
      setUnassignedMachines(data.unassigned || []);
    } catch {
      // ignore
    }
  }, [clientId]);

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

  const refreshDealStatuses = useCallback(async () => {
    const dealIds = payoutHistory
      .map((p) => p.cyclops_deal_id)
      .filter((id): id is string => !!id);

    if (dealIds.length === 0) {
      setDealStatuses({});
      return;
    }

    setIsLoadingHistory(true);
    try {
      const nextStatuses: Record<string, string> = {};
      await Promise.all(dealIds.map(async (dealId) => {
        try {
          const res = await fetch(`/api/deals/${dealId}?layer=${layer}`);
          const data = await res.json();
          const payload = data?.result ?? data;
          const deal = payload?.deal;
          if (deal?.status) {
            nextStatuses[dealId] = deal.status;
          }
        } catch {
          // ignore individual deal errors
        }
      }));
      setDealStatuses(nextStatuses);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [layer, payoutHistory]);

  useEffect(() => {
    loadClient();
    loadMachines();
  }, [loadClient, loadMachines]);

  useEffect(() => {
    loadSbpBanks();
    loadVirtualAccounts();
  }, [loadSbpBanks, loadVirtualAccounts]);

  useEffect(() => {
    if (payoutHistory.length > 0) {
      refreshDealStatuses();
    } else {
      setDealStatuses({});
    }
  }, [payoutHistory, refreshDealStatuses]);

  // Инициализация настроек автовыплат из данных клиента
  useEffect(() => {
    if (client) {
      setClientCommission(client.commission_percent?.toString() || '');
      setPayoutFrequency(client.payout_frequency || '');
      setExcludeDays(String(client.payout_exclude_days ?? 0));
      setAutoPayoutEnabled(client.auto_payout_enabled);
    }
  }, [client]);

  const resetTemplateState = useCallback((source: Client) => {
    const nextType = (source.payout_type === 'none' ? 'payment_contract' : source.payout_type) as TemplatePayoutType;
    setTemplateType(nextType);
    setTemplateBankAccount(source.bank_account || '');
    setTemplateBankCode(source.bank_code || '');
    setTemplateRecipientName(source.recipient_name || '');
    setTemplateInn(source.inn || '');
    setTemplateKpp(source.kpp || '');
    setTemplatePurpose(source.payout_purpose || '');
    setTemplateSbpPhone(source.sbp_phone || '');
    setTemplateSbpBankId(source.sbp_bank_id || '');
    setTemplateSbpFirstName(source.sbp_first_name || '');
    setTemplateSbpMiddleName(source.sbp_middle_name || '');
    setTemplateSbpLastName(source.sbp_last_name || '');
    setTemplateCardNumber('');
    setTemplateCardFirstName(source.card_first_name || '');
    setTemplateCardMiddleName(source.card_middle_name || '');
    setTemplateCardLastName(source.card_last_name || '');
    setSelectedVirtualAccount(source.payout_virtual_account || '');
    setTemplateMessage(null);
  }, []);

  useEffect(() => {
    if (client) {
      resetTemplateState(client);
      setIsEditingTemplate(false);
    }
  }, [client, resetTemplateState]);

  const handleAssignMachine = async () => {
    if (selectedMachineIds.length === 0) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_ids: selectedMachineIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка привязки');
      }
      addRecentAction({
        type: 'Привязка автомата',
        description: `Привязано автоматов: ${selectedMachineIds.length} (клиент ${client?.name})`,
        layer,
      });
      setSelectedMachineIds([]);
      setLastSelectedIndex(null);
      loadMachines();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignMachine = async (assignmentId: number) => {
    if (!confirm('Отвязать автомат?')) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/machines?assignment_id=${assignmentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Ошибка');
      loadMachines();
    } catch {
      alert('Ошибка при отвязке');
    }
  };

  const filteredUnassignedMachines = unassignedMachines.filter((m) => {
    if (!machineSearch) return true;
    const term = machineSearch.toLowerCase();
    return (
      (m.name || '').toLowerCase().includes(term) ||
      (m.vendista_id || '').toLowerCase().includes(term) ||
      (m.address || '').toLowerCase().includes(term)
    );
  });

  const toggleMachineSelection = (id: number, index: number, event: React.MouseEvent | React.ChangeEvent) => {
    const isShift = 'shiftKey' in event && event.shiftKey;
    const isToggle = 'metaKey' in event ? event.metaKey : ('ctrlKey' in event && event.ctrlKey);

    if (isShift && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeIds = filteredUnassignedMachines.slice(start, end + 1).map((m) => m.id);
      setSelectedMachineIds((prev) => {
        if (isToggle) {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return Array.from(next);
        }
        return rangeIds;
      });
      setLastSelectedIndex(index);
      return;
    }

    setSelectedMachineIds((prev) => {
      if (isToggle) {
        return prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id];
      }
      return [id];
    });
    setLastSelectedIndex(index);
  };

  const handleSaveAutoPayoutSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage(null);
    try {
      const commission = clientCommission ? parseFloat(clientCommission) : null;

      // Валидация при включении автовыплат
      if (autoPayoutEnabled) {
        if (client?.payout_type === 'none') {
          setSettingsMessage({ type: 'error', text: 'Добавьте шаблон выплаты, чтобы включить автовыплаты' });
          setIsSavingSettings(false);
          return;
        }
        if (commission === null || isNaN(commission)) {
          setSettingsMessage({ type: 'error', text: 'Укажите комиссию для включения автовыплат' });
          setIsSavingSettings(false);
          return;
        }
        if (!payoutFrequency) {
          setSettingsMessage({ type: 'error', text: 'Выберите частоту выплат' });
          setIsSavingSettings(false);
          return;
        }
        if (!client?.document_filename) {
          setSettingsMessage({ type: 'error', text: 'Загрузите документ (договор) для включения автовыплат' });
          setIsSavingSettings(false);
          return;
        }
      }

      const updates: Record<string, unknown> = {
        commission_percent: commission,
        payout_frequency: payoutFrequency || null,
        payout_exclude_days: Number.isNaN(parseInt(excludeDays, 10)) ? 0 : parseInt(excludeDays, 10),
        auto_payout_enabled: autoPayoutEnabled,
      };

      // Устанавливаем начальную дату автовыплаты при первом включении
      if (autoPayoutEnabled && !client?.next_payout_at && payoutFrequency) {
        const today = new Date().toISOString().split('T')[0];
        updates.next_payout_at = today;
      }

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка сохранения');
      }
      setSettingsMessage({ type: 'success', text: 'Настройки сохранены' });
      await loadClient();
    } catch (err) {
      setSettingsMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!client) return;
    setIsSavingTemplate(true);
    setTemplateMessage(null);

    try {
      const commission = clientCommission ? parseFloat(clientCommission) : null;
      if (commission === null || Number.isNaN(commission)) {
        throw new Error('Укажите комиссию платформы');
      }

      const purposeValue = templatePurpose.trim();
      if (purposeValue) {
        const maxLength = templateType === 'payment_contract_by_sbp' || templateType === 'payment_contract_by_sbp_v2' ? 140 : 210;
        if (purposeValue.length > maxLength) {
          throw new Error(`Назначение платежа не должно превышать ${maxLength} символов`);
        }
      }

      const updates: Record<string, unknown> = {
        payout_type: templateType,
        commission_percent: commission,
        bank_account: null,
        bank_code: null,
        inn: null,
        kpp: null,
        recipient_name: null,
        sbp_phone: null,
        sbp_bank_id: null,
        sbp_first_name: null,
        sbp_middle_name: null,
        sbp_last_name: null,
        card_number_encrypted: null,
        card_first_name: null,
        card_middle_name: null,
        card_last_name: null,
        payout_purpose: purposeValue || null,
      };

      if (templateType === 'payment_contract') {
        if (!templateBankAccount || !templateBankCode || !templateInn) {
          throw new Error('Заполните расчётный счёт, БИК и ИНН');
        }
        updates.bank_account = templateBankAccount;
        updates.bank_code = templateBankCode;
        updates.inn = templateInn;
        updates.kpp = templateKpp || null;
        updates.recipient_name = templateRecipientName || null;
      }

      if (templateType === 'payment_contract_by_sbp' || templateType === 'payment_contract_by_sbp_v2') {
        if (!templateSbpPhone || !templateSbpBankId || !templateSbpFirstName || !templateSbpLastName) {
          throw new Error('Заполните телефон, банк и ФИО для СБП');
        }
        updates.sbp_phone = templateSbpPhone;
        updates.sbp_bank_id = templateSbpBankId;
        updates.sbp_first_name = templateSbpFirstName;
        updates.sbp_middle_name = templateSbpMiddleName || null;
        updates.sbp_last_name = templateSbpLastName;
        updates.inn = templateInn || null;
      }

      if (templateType === 'payment_contract_to_card') {
        const cleanCardNumber = normalizeCardNumber(templateCardNumber);
        const hasExistingCard = Boolean(client.card_number_encrypted);
        if (!cleanCardNumber && !hasExistingCard) {
          throw new Error('Введите номер карты');
        }
        if (cleanCardNumber) {
          if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
            throw new Error('Номер карты должен содержать от 13 до 19 цифр');
          }
          updates.card_number_encrypted = await encryptCardNumber(cleanCardNumber);
        } else {
          updates.card_number_encrypted = undefined;
        }
        if (!templateCardFirstName || !templateCardLastName) {
          throw new Error('Заполните имя и фамилию для карты');
        }
        updates.card_first_name = templateCardFirstName;
        updates.card_middle_name = templateCardMiddleName || null;
        updates.card_last_name = templateCardLastName;
        updates.inn = templateInn || null;
      }

      if (!selectedVirtualAccount) {
        throw new Error('Выберите виртуальный счёт плательщика');
      }
      updates.payout_virtual_account = selectedVirtualAccount;

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Ошибка сохранения шаблона');
      }

      addRecentAction({
        type: 'Обновление шаблона',
        description: `Обновлён шаблон клиента ${client.name}`,
        layer,
      });
      setTemplateMessage({ type: 'success', text: 'Шаблон сохранён' });
      setIsEditingTemplate(false);
      loadClient();
    } catch (err) {
      setTemplateMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка' });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!client) return;
    if (!confirm('Удалить шаблон выплаты?')) return;
    setIsSavingTemplate(true);
    setTemplateMessage(null);

    try {
      const updates: Record<string, unknown> = {
        payout_type: 'none',
        auto_payout_enabled: false,
        next_payout_at: null,
        bank_account: null,
        bank_code: null,
        inn: null,
        kpp: null,
        recipient_name: null,
        sbp_phone: null,
        sbp_bank_id: null,
        sbp_first_name: null,
        sbp_middle_name: null,
        sbp_last_name: null,
        card_number_encrypted: null,
        card_first_name: null,
        card_middle_name: null,
        card_last_name: null,
        payout_purpose: null,
      };

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Ошибка удаления шаблона');
      }

      addRecentAction({
        type: 'Удаление шаблона',
        description: `Удалён шаблон клиента ${client.name}`,
        layer,
      });
      setTemplateMessage({ type: 'success', text: 'Шаблон удалён' });
      setIsEditingTemplate(false);
      loadClient();
    } catch (err) {
      setTemplateMessage({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка' });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!documentFile) return;
    setIsUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', documentFile);
      const res = await fetch(`/api/clients/${clientId}/document`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка загрузки');
      }
      setDocumentFile(null);
      addRecentAction({
        type: 'Загрузка документа',
        description: `Загружен документ для клиента ${client?.name}`,
        layer,
      });
      await loadClient();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!confirm('Удалить документ?')) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/document`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка удаления');
      }
      await loadClient();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleCalculate = async () => {
    setIsCalculating(true);
    setCalculation(null);
    setPayoutResult(null);
    try {
      const startDate = getDefaultStartDate(endDate);
      console.log('[Client Payout] Calculating payout:', {
        clientId,
        endDate,
        startDate,
        layer,
      });

      const res = await fetch(`/api/clients/${clientId}/payout?layer=${layer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calculate', end_date: endDate, start_date: startDate }),
      });
      const data = await res.json();

      console.log('[Client Payout] API Response:', data);
      console.log('[Client Payout] Debug info:', data.debug);
      console.log('[Client Payout] Calculation:', data.calculation);

      if (!res.ok) throw new Error(data.error || 'Ошибка расчёта');
      setCalculation(data.calculation);
    } catch (err) {
      console.error('[Client Payout] Error:', err);
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleExecutePayout = async () => {
    if (!calculation || calculation.payout_amount <= 0) return;
    if (!confirm(`Выполнить выплату ${calculation.payout_amount.toFixed(2)} руб. клиенту "${client?.name}"?`)) return;

    setIsExecuting(true);
    setPayoutResult(null);
    try {
      const startDate = calculation.period_start || getDefaultStartDate(endDate);
      const res = await fetch(`/api/clients/${clientId}/payout?layer=${layer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', end_date: endDate, start_date: startDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayoutResult({
          success: false,
          message: data.error || 'Ошибка выплаты',
        });
        return;
      }
      setPayoutResult({
        success: true,
        message: `Выплата выполнена! Deal ID: ${data.cyclops_deal_id}`,
        deal_id: data.cyclops_deal_id,
      });
      addRecentAction({
        type: 'Выплата',
        description: `Выплата ${calculation.payout_amount.toFixed(2)} руб. клиенту ${client?.name}`,
        layer,
      });
      setCalculation(null);
    } catch (err) {
      setPayoutResult({
        success: false,
        message: err instanceof Error ? err.message : 'Ошибка',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDocSelect = (file?: File) => {
    if (!file) return;
    setDocumentFile(file);
  };

  const handleExport = (format: 'pdf' | 'xlsx' | 'csv') => {
    const params = new URLSearchParams({
      format,
      date_from: historyFrom,
      date_to: historyTo,
      layer,
    });
    window.open(`/api/clients/${clientId}/payouts/export?${params.toString()}`, '_blank');
  };

  if (isLoading) return <div style={{ padding: 24 }}>Загрузка...</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--error-color)' }}>{error}</div>;
  if (!client) return <div style={{ padding: 24 }}>Клиент не найден</div>;

  const isTemplateMissing = client.payout_type === 'none';

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>{client.name}</h1>
          <div className="header-meta">
            <span className={`badge ${client.is_active ? 'badge-success' : 'badge-muted'}`}>
              {client.is_active ? 'Активен' : 'Неактивен'}
            </span>
            <span className="badge badge-info">
              {PAYOUT_TYPE_LABELS[client.payout_type]}
            </span>
            {client.beneficiary_id && (
              <Link href={`/beneficiaries`} className="text-link text-sm">
                Бенефициар: {client.beneficiary_id.slice(0, 8)}...
              </Link>
            )}
          </div>
        </div>
        <button onClick={() => router.push('/clients')} className="btn btn-secondary">
          К списку
        </button>
      </div>

      {/* Info Cards */}
      <div className="cards-grid">
        <div className="info-card">
          <h3>Контакты</h3>
          <div className="info-rows">
            {client.contact_name && <div className="info-row"><span>Контактное лицо:</span> {client.contact_name}</div>}
            {client.phone && <div className="info-row"><span>Телефон:</span> {client.phone}</div>}
            {client.email && <div className="info-row"><span>Email:</span> {client.email}</div>}
            {!client.contact_name && !client.phone && !client.email && (
              <div className="text-secondary">Не указаны</div>
            )}
          </div>
        </div>

        <div className="info-card">
          <h3>Реквизиты для выплат</h3>
          <div className="info-rows">
            {client.payout_type === 'payment_contract' && (
              <>
                <div className="info-row"><span>Счёт:</span> <code>{client.bank_account}</code></div>
                <div className="info-row"><span>БИК:</span> <code>{client.bank_code}</code></div>
                <div className="info-row"><span>ИНН:</span> <code>{client.inn}</code></div>
                {client.kpp && <div className="info-row"><span>КПП:</span> <code>{client.kpp}</code></div>}
                {client.recipient_name && <div className="info-row"><span>Получатель:</span> {client.recipient_name}</div>}
              </>
            )}
            {(client.payout_type === 'payment_contract_by_sbp' || client.payout_type === 'payment_contract_by_sbp_v2') && (
              <>
                <div className="info-row"><span>Телефон:</span> <code>{client.sbp_phone}</code></div>
                <div className="info-row"><span>Банк СБП:</span> {client.sbp_bank_id}</div>
                <div className="info-row"><span>ФИО:</span> {client.sbp_last_name} {client.sbp_first_name} {client.sbp_middle_name || ''}</div>
              </>
            )}
            {client.payout_type === 'payment_contract_to_card' && (
              <>
                <div className="info-row"><span>Карта:</span> ****</div>
                <div className="info-row"><span>ФИО:</span> {client.card_last_name} {client.card_first_name} {client.card_middle_name || ''}</div>
              </>
            )}
            {client.payout_type !== 'none' && client.payout_purpose && (
              <div className="info-row"><span>Назначение:</span> {client.payout_purpose}</div>
            )}
            {client.payout_type === 'none' && (
              <div className="text-secondary">Шаблон выплаты не задан</div>
            )}
          </div>
        </div>
      </div>

      {/* Template */}
      <div className="section">
        <div className="section-header">
          <h2>Шаблон выплаты</h2>
          <div className="template-actions">
            {!isEditingTemplate && client.payout_type === 'none' && (
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setIsEditingTemplate(true)}
              >
                Добавить шаблон
              </button>
            )}
            {!isEditingTemplate && client.payout_type !== 'none' && (
              <>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIsEditingTemplate(true)}
                >
                  Редактировать
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={handleDeleteTemplate}
                  disabled={isSavingTemplate}
                >
                  Удалить
                </button>
              </>
            )}
          </div>
        </div>

        {templateMessage && (
          <div className={`result-message ${templateMessage.type}`}>{templateMessage.text}</div>
        )}

        {!isEditingTemplate && client.payout_type === 'none' && (
          <div className="text-secondary">Шаблон выплаты не задан. Можно добавить его сейчас или позже.</div>
        )}

        {isEditingTemplate && (
          <div className="template-form">
            <div className="form-row">
              <div className="form-group commission-field">
                <label className="form-label">Комиссия платформы (%) *</label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    className="form-input"
                    value={clientCommission}
                    onChange={(e) => setClientCommission(e.target.value)}
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="Напр. 3"
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
                    ? templateType === 'payment_contract_by_sbp' || templateType === 'payment_contract_by_sbp_v2'
                    : templateType === pt.value;
                  return (
                    <button
                      key={pt.value}
                      type="button"
                      className={`payment-type ${isActive ? 'active' : ''}`}
                      onClick={() => setTemplateType(isSbpOption ? 'payment_contract_by_sbp' : pt.value)}
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

            {templateType === 'payment_contract' && (
              <div className="recipient-fields">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Расчётный счёт *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="40702810000000000001"
                      maxLength={20}
                      value={templateBankAccount}
                      onChange={(e) => setTemplateBankAccount(e.target.value.replace(/\D/g, '').slice(0, 20))}
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
                      value={templateBankCode}
                      onChange={(e) => setTemplateBankCode(e.target.value.replace(/\D/g, '').slice(0, 9))}
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
                    value={templateRecipientName}
                    onChange={(e) => setTemplateRecipientName(e.target.value)}
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
                      value={templateInn}
                      onChange={(e) => setTemplateInn(e.target.value.replace(/\D/g, '').slice(0, 12))}
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
                      value={templateKpp}
                      onChange={(e) => setTemplateKpp(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Назначение платежа</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Оплата по договору N123. НДС не облагается"
                    maxLength={210}
                    value={templatePurpose}
                    onChange={(e) => setTemplatePurpose(e.target.value)}
                  />
                  <p className="form-hint">Можно использовать {`{period}`} для подстановки периода.</p>
                </div>
              </div>
            )}

            {(templateType === 'payment_contract_by_sbp' || templateType === 'payment_contract_by_sbp_v2') && (
              <div className="recipient-fields">
                <div className="form-group">
                  <label className="form-label">Версия API СБП</label>
                  <select
                    className="form-input form-select"
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value as TemplatePayoutType)}
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
                      value={templateSbpPhone ? formatPhone(templateSbpPhone) : ''}
                      onChange={(e) => setTemplateSbpPhone(normalizePhone(e.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Банк получателя *</label>
                    <select
                      className="form-input form-select"
                      value={templateSbpBankId}
                      onChange={(e) => setTemplateSbpBankId(e.target.value)}
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
                      value={templateSbpLastName}
                      onChange={(e) => setTemplateSbpLastName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={templateSbpFirstName}
                      onChange={(e) => setTemplateSbpFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      value={templateSbpMiddleName}
                      onChange={(e) => setTemplateSbpMiddleName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Назначение платежа (до 140 символов)</label>
                  <textarea
                    className="form-input form-textarea"
                    maxLength={140}
                    value={templatePurpose}
                    onChange={(e) => setTemplatePurpose(e.target.value)}
                    placeholder="Необязательно"
                  />
                  <p className="form-hint">Можно использовать {`{period}`} для подстановки периода.</p>
                </div>
              </div>
            )}

            {templateType === 'payment_contract_to_card' && (
              <div className="recipient-fields">
                <div className="form-group">
                  <label className="form-label">Номер карты *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="0000 0000 0000 0000"
                    maxLength={23}
                    value={templateCardNumber ? formatCardNumber(templateCardNumber) : ''}
                    onChange={(e) => setTemplateCardNumber(normalizeCardNumber(e.target.value))}
                  />
                  <p className="form-hint">Номер карты (13-19 цифр) будет зашифрован перед отправкой</p>
                </div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Фамилия *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={templateCardLastName}
                      onChange={(e) => setTemplateCardLastName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={templateCardFirstName}
                      onChange={(e) => setTemplateCardFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      value={templateCardMiddleName}
                      onChange={(e) => setTemplateCardMiddleName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Назначение платежа (до 210 символов)</label>
                  <textarea
                    className="form-input form-textarea"
                    maxLength={210}
                    value={templatePurpose}
                    onChange={(e) => setTemplatePurpose(e.target.value)}
                    placeholder="Необязательно"
                  />
                  <p className="form-hint">Можно использовать {`{period}`} для подстановки периода.</p>
                </div>
              </div>
            )}

            <div className="template-actions-row">
              <button
                className="btn btn-primary"
                onClick={handleSaveTemplate}
                disabled={isSavingTemplate}
              >
                {isSavingTemplate ? 'Сохранение...' : 'Сохранить шаблон'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (client) {
                    resetTemplateState(client);
                  }
                  setIsEditingTemplate(false);
                  setTemplateMessage(null);
                }}
                type="button"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Payout Settings */}
      <div className="section">
        <div className="section-header">
          <h2>Настройки автовыплат</h2>
          {client.auto_payout_enabled && (
            <span className="badge badge-success">Активно</span>
          )}
        </div>

        <div className="auto-payout-form">
          <div className="form-row">
            <div className="form-group">
              <label>Частота выплат</label>
              <select
                className="input"
                value={payoutFrequency}
                onChange={(e) => setPayoutFrequency(e.target.value)}
              >
                <option value="">Не задана</option>
                <option value="weekly">Еженедельно</option>
                <option value="biweekly">Раз в 2 недели</option>
                <option value="monthly">Ежемесячно</option>
              </select>
            </div>
            <div className="form-group">
              <label>Исключить дней</label>
              <input
                type="number"
                className="input"
                value={excludeDays}
                onChange={(e) => setExcludeDays(e.target.value)}
                min={0}
                max={30}
                style={{ width: 80 }}
              />
            </div>
          </div>

          <div className="form-row" style={{ alignItems: 'center', marginTop: 12 }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoPayoutEnabled}
                onChange={(e) => setAutoPayoutEnabled(e.target.checked)}
                disabled={isTemplateMissing}
              />
              Автоматические выплаты включены
            </label>
            {client.next_payout_at && (
              <span className="text-secondary text-sm">
                Следующая выплата: {client.next_payout_at}
              </span>
            )}
          </div>
          {isTemplateMissing && (
            <div className="text-secondary text-sm" style={{ marginTop: 8 }}>
              Добавьте шаблон выплаты, чтобы включить автовыплаты.
            </div>
          )}

          {settingsMessage && (
            <div className={`result-message ${settingsMessage.type}`} style={{ marginTop: 12 }}>
              {settingsMessage.text}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSaveAutoPayoutSettings}
            disabled={isSavingSettings}
            style={{ marginTop: 12 }}
          >
            {isSavingSettings ? 'Сохранение...' : 'Сохранить настройки'}
          </button>
        </div>

        {/* Document */}
        <div className="document-section">
          <h3>Документ (договор)</h3>
          {client.document_filename ? (
            <div className="document-info">
              <span>{client.document_filename}</span>
              {client.document_uploaded_at && (
                <span className="text-secondary text-sm">
                  загружен {new Date(client.document_uploaded_at).toLocaleDateString('ru-RU')}
                </span>
              )}
              <a
                href={`/api/clients/${clientId}/document`}
                className="text-link text-sm"
                target="_blank"
                rel="noopener noreferrer"
              >
                Скачать
              </a>
              <button className="btn btn-sm btn-danger" onClick={handleDeleteDocument}>
                Удалить
              </button>
            </div>
          ) : (
            <div className="document-upload">
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
                onChange={(e) => handleDocSelect(e.target.files?.[0])}
                className="file-input-hidden"
              />
              <button
                className="btn btn-sm btn-primary"
                onClick={handleUploadDocument}
                disabled={!documentFile || isUploadingDoc}
              >
                {isUploadingDoc ? 'Загрузка...' : 'Загрузить'}
              </button>
            </div>
          )}
          {!client.document_filename && (
            <p className="text-secondary text-sm" style={{ marginTop: 8 }}>
              Без документа выплаты невозможны. Поддерживаемые форматы: PDF, JPG, PNG, TIFF, BMP.
            </p>
          )}
        </div>
      </div>

      {/* Machines */}
      <div className="section">
        <div className="section-header">
          <h2>Привязанные автоматы ({machines.length})</h2>
          <button className="btn btn-sm btn-primary" onClick={() => { setShowAssign(!showAssign); loadMachines(); }}>
            + Привязать
          </button>
        </div>

        {showAssign && (
          <div className="assign-form">
            <div className="assign-toolbar">
              <input
                type="text"
                className="input"
                placeholder="Поиск по названию, адресу или ID"
                value={machineSearch}
                onChange={(e) => setMachineSearch(e.target.value)}
              />
              <div className="assign-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSelectedMachineIds(filteredUnassignedMachines.map((m) => m.id))}
                  disabled={filteredUnassignedMachines.length === 0}
                  type="button"
                >
                  Выбрать все
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setSelectedMachineIds([]);
                    setLastSelectedIndex(null);
                  }}
                  disabled={selectedMachineIds.length === 0}
                  type="button"
                >
                  Снять выбор
                </button>
              </div>
            </div>
            <div className="assign-list">
              {filteredUnassignedMachines.length === 0 ? (
                <div className="text-secondary text-sm">Нет доступных автоматов</div>
              ) : (
                filteredUnassignedMachines.map((m, index) => {
                  const isSelected = selectedMachineIds.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`assign-item ${isSelected ? 'selected' : ''}`}
                      onClick={(e) => {
                        toggleMachineSelection(m.id, index, e);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMachineSelection(m.id, index, e);
                        }}
                        onChange={() => {}}
                      />
                      <div className="assign-item-main">
                        <div className="assign-item-title">{m.name || m.vendista_id}</div>
                        <div className="assign-item-subtitle">
                          {m.address || 'Адрес не указан'} · {m.vendista_id}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleAssignMachine}
              disabled={selectedMachineIds.length === 0 || isAssigning}
            >
              {isAssigning ? '...' : `Привязать (${selectedMachineIds.length})`}
            </button>
          </div>
        )}

        {machines.length === 0 ? (
          <div className="empty-message">Нет привязанных автоматов</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Автомат</th>
                  <th>Адрес</th>
                  <th>Привязан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.assignment_id}>
                    <td>{m.name || m.vendista_id}</td>
                    <td className="text-secondary">{m.address || '—'}</td>
                    <td className="text-secondary text-sm">
                      {new Date(m.assigned_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleUnassignMachine(m.assignment_id)}
                      >
                        Отвязать
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payout */}
      <div className="section">
        <div className="section-header">
          <h2>Выплата</h2>
        </div>

        <div className="payout-controls">
          <div className="form-group" style={{ flex: 1, maxWidth: 280 }}>
            <label>Дата окончания периода</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <button
              className="btn btn-secondary"
              onClick={handleCalculate}
              disabled={isCalculating || machines.length === 0}
            >
              {isCalculating ? 'Расчёт...' : 'Рассчитать'}
            </button>
          </div>
        </div>

        {payoutResult && (
          <div className={`result-message ${payoutResult.success ? 'success' : 'error'}`}>
            {payoutResult.message}
            {payoutResult.deal_id && (
              <div>
                <Link href={`/deals/${payoutResult.deal_id}`} className="text-link">
                  Открыть сделку
                </Link>
              </div>
            )}
          </div>
        )}

        {calculation && (
          <div className="calculation-result">
            <div className="calc-summary">
              <div className="calc-item">
                <span>Период:</span>
                <strong>{formatPeriodValue(calculation.period_start)} — {formatPeriodValue(calculation.period_end)}</strong>
              </div>
              <div className="calc-item">
                <span>Общие продажи:</span>
                <strong>{calculation.total_sales.toFixed(2)} руб.</strong>
              </div>
              <div className="calc-item">
                <span>Комиссия{client.commission_percent !== null ? ` (${client.commission_percent}%)` : ''}:</span>
                <strong>{calculation.total_commission.toFixed(2)} руб.</strong>
              </div>
              <div className="calc-item highlight">
                <span>К выплате:</span>
                <strong>{calculation.payout_amount.toFixed(2)} руб.</strong>
              </div>
            </div>

            {calculation.machines.length > 0 && (
              <div className="table-container" style={{ marginTop: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Автомат</th>
                      <th>Продажи</th>
                      <th>Комиссия %</th>
                      <th>Комиссия</th>
                      <th>К выплате</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculation.machines.map((m) => (
                      <tr key={m.machine_id}>
                        <td>{m.machine_name || m.vendista_id}</td>
                        <td>{m.sales_amount.toFixed(2)}</td>
                        <td>{m.commission_percent}%</td>
                        <td>{m.commission_amount.toFixed(2)}</td>
                        <td><strong>{m.net_amount.toFixed(2)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {calculation.payout_amount > 0 && (
              <div className="payout-action">
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleExecutePayout}
                  disabled={isExecuting || isTemplateMissing}
                >
                  {isExecuting
                    ? 'Выполнение выплаты...'
                    : isTemplateMissing
                      ? 'Добавьте шаблон выплаты'
                      : `Выполнить выплату ${calculation.payout_amount.toFixed(2)} руб.`}
                </button>
                <p className="text-secondary text-sm" style={{ marginTop: 8 }}>
                  {isTemplateMissing
                    ? 'Шаблон выплаты не задан. Добавьте реквизиты клиента.'
                    : `Будет создана и исполнена сделка в Cyclops (${PAYOUT_TYPE_LABELS[client.payout_type]})`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payout History */}
      <div className="section">
        <div className="section-header">
          <h2>История выплат</h2>
          <div className="history-actions">
            <button
              className="btn btn-sm btn-secondary"
              onClick={refreshDealStatuses}
              disabled={isLoadingHistory || payoutHistory.length === 0}
            >
              {isLoadingHistory ? 'Обновление...' : 'Обновить статусы'}
            </button>
          </div>
        </div>

        <div className="history-filters">
          <div className="form-group">
            <label>Период с</label>
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => setHistoryFrom(e.target.value)}
              className="input"
            />
          </div>
          <div className="form-group">
            <label>по</label>
            <input
              type="date"
              value={historyTo}
              onChange={(e) => setHistoryTo(e.target.value)}
              className="input"
            />
          </div>
          <div className="history-export">
            <span className="text-secondary text-sm">Справка:</span>
            <button className="btn btn-sm btn-secondary" type="button" onClick={() => handleExport('pdf')}>
              PDF
            </button>
            <button className="btn btn-sm btn-secondary" type="button" onClick={() => handleExport('xlsx')}>
              Excel
            </button>
            <button className="btn btn-sm btn-secondary" type="button" onClick={() => handleExport('csv')}>
              CSV
            </button>
          </div>
        </div>

        {payoutHistory.length === 0 ? (
          <div className="empty-message">Нет выплат</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Период</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Сделка</th>
                  <th>Статус сделки</th>
                  <th>Создана</th>
                </tr>
              </thead>
              <tbody>
                {payoutHistory.map((payout) => {
                  const statusClass = PAYOUT_STATUS_CLASSES[payout.status] || 'badge-muted';
                  const statusLabel = PAYOUT_STATUS_LABELS[payout.status] || payout.status;
                  const dealStatus = payout.cyclops_deal_id
                    ? dealStatuses[payout.cyclops_deal_id] || '—'
                    : '—';

                  return (
                    <tr key={payout.id}>
                      <td>
                        {formatPeriodValue(payout.period_start)} — {formatPeriodValue(payout.period_end)}
                      </td>
                      <td>{payout.payout_amount.toFixed(2)} руб.</td>
                      <td>
                        <div className="status-cell">
                          <span className={`badge ${statusClass}`}>{statusLabel}</span>
                          <span className={`badge ${payout.is_auto ? 'badge-muted' : 'badge-info'}`}>
                            {payout.is_auto ? 'Авто' : 'Ручная'}
                          </span>
                        </div>
                        {payout.error_message && (
                          <div className="text-secondary text-sm">{payout.error_message}</div>
                        )}
                      </td>
                      <td>
                        {payout.cyclops_deal_id ? (
                          <Link href={`/deals/${payout.cyclops_deal_id}`} className="text-link text-sm">
                            {payout.cyclops_deal_id.slice(0, 8)}...
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="text-secondary text-sm">{dealStatus}</td>
                      <td className="text-secondary text-sm">
                        {new Date(payout.created_at).toLocaleDateString('ru-RU')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {client.notes && (
        <div className="section">
          <h2>Заметки</h2>
          <p className="text-secondary">{client.notes}</p>
        </div>
      )}

      <style jsx>{`
        .page-container {
          padding: 24px;
          max-width: 1100px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .page-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 8px;
        }
        .header-meta {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-success { background: #dcfce7; color: #166534; }
        .badge-muted { background: var(--bg-secondary); color: var(--text-secondary); }
        .badge-info { background: #dbeafe; color: #1e40af; }
        .badge-danger { background: #fee2e2; color: #b91c1c; }
        .cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .info-card {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }
        .info-card h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .info-rows {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .info-row {
          font-size: 14px;
          color: var(--text-primary);
        }
        .info-row span {
          color: var(--text-secondary);
        }
        .info-row code {
          font-family: var(--font-mono);
          font-size: 13px;
          background: var(--bg-secondary);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .section {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
        }
        .section h2 {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .assign-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
        }
        .assign-toolbar {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .assign-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .assign-list {
          border: 1px solid var(--border-color);
          border-radius: 10px;
          background: var(--bg-primary);
          max-height: 260px;
          overflow-y: auto;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .assign-item {
          display: grid;
          grid-template-columns: 20px 1fr;
          gap: 10px;
          align-items: center;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .assign-item input {
          width: 16px;
          height: 16px;
        }
        .assign-item.selected {
          background: var(--accent-bg);
          border-color: var(--accent-color);
        }
        .assign-item-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .assign-item-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .assign-item-subtitle {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .empty-message {
          text-align: center;
          padding: 24px;
          color: var(--text-secondary);
          font-size: 14px;
        }
        .table-container {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th {
          text-align: left;
          padding: 10px 14px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
        }
        .data-table td {
          padding: 10px 14px;
          font-size: 14px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-color);
        }
        .data-table tr:last-child td { border-bottom: none; }
        .payout-controls {
          display: flex;
          gap: 16px;
          align-items: flex-end;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .payout-controls .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .payout-controls .input {
          height: 42px;
        }
        .payout-controls .btn {
          height: 42px;
          white-space: nowrap;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 16px;
        }
        .form-row-3 {
          grid-template-columns: repeat(3, 1fr);
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
        .template-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .template-actions-row {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-top: 16px;
        }
        .template-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .payout-account-info {
          padding: 14px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
        }
        .payout-account-info .info-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .payout-account-info .info-value {
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
        .calculation-result {
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 20px;
          background: var(--bg-secondary);
        }
        .calc-summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .calc-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 14px;
        }
        .calc-item span {
          color: var(--text-secondary);
          font-size: 12px;
        }
        .calc-item strong {
          font-size: 16px;
        }
        .calc-item.highlight strong {
          color: var(--accent-color);
          font-size: 20px;
        }
        .payout-action {
          margin-top: 20px;
          text-align: center;
        }
        .result-message {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
        }
        .result-message.success {
          background: #dcfce7;
          color: #166534;
        }
        .result-message.error {
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #dc2626);
        }
        .text-link {
          color: var(--accent-color);
          text-decoration: none;
        }
        .text-link:hover {
          text-decoration: underline;
        }
        .status-cell {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 2px;
        }
        .history-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .history-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: flex-end;
          margin-bottom: 16px;
        }
        .history-export {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-left: auto;
        }
        .text-secondary { color: var(--text-secondary); }
        .text-sm { font-size: 12px; }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-sm { padding: 6px 12px; font-size: 13px; }
        .btn-lg { padding: 14px 28px; font-size: 16px; }
        .btn-primary { background: var(--accent-color, #6366f1); color: white; }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
        .btn-secondary:hover { background: var(--bg-tertiary); }
        .btn-danger { background: transparent; color: var(--error-color, #dc2626); }
        .btn-danger:hover { background: var(--error-bg, #fef2f2); }
        .auto-payout-form {
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
        }
        .form-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          cursor: pointer;
        }
        .checkbox-label input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: var(--accent-color, #6366f1);
        }
        .document-section {
          margin-top: 20px;
          border-top: 1px solid var(--border-color);
          padding-top: 16px;
        }
        .document-section h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .document-info {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .document-upload {
          display: flex;
          gap: 12px;
          align-items: center;
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
          padding: 16px;
          border: 2px dashed var(--border-color);
          border-radius: 12px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
          text-align: center;
          min-width: 240px;
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
        @media (max-width: 767px) {
          .page-container { padding: 16px; }
          .cards-grid { grid-template-columns: 1fr; }
          .calc-summary { grid-template-columns: 1fr 1fr; }
          .payout-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .payout-controls .form-group {
            max-width: none !important;
          }
          .assign-form { flex-direction: column; }
          .form-row { grid-template-columns: 1fr; }
          .form-row-3 { grid-template-columns: 1fr; }
          .payment-types { grid-template-columns: 1fr; }
          .document-info { flex-direction: column; align-items: flex-start; }
          .commission-field { max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
