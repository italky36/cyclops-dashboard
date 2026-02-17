'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { BeneficiaryListItem } from '@/types/cyclops';

interface Beneficiary {
  beneficiary_id: string;
  type: 'ul' | 'ip' | 'fl';
  inn: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
}

interface PayoutCalculation {
  beneficiary_id: string;
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

interface Payout {
  id: number;
  beneficiary_id: string;
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
}

interface PayoutSchedule {
  id: number;
  cron_expression: string;
  is_enabled: boolean;
  last_run_at: string | null;
  updated_at: string;
}

interface ClientItem {
  id: number;
  name: string;
  inn: string | null;
  payout_type: string;
  machine_count: number;
}

interface ClientPayoutCalculation {
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

interface ClientMachineItem {
  beneficiary_id?: string | null;
}

interface VirtualAccountOption {
  id: string;
  balance?: number;
  beneficiary_id?: string;
}

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  payment_contract: 'Банк. перевод',
  payment_contract_by_sbp: 'СБП',
  payment_contract_by_sbp_v2: 'СБП (v2)',
  payment_contract_to_card: 'Карта',
  none: 'Без шаблона',
};

const getDefaultStartDate = (value: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setMonth(parsed.getMonth() - 1);
  return parsed.toISOString().split('T')[0];
};

export default function PayoutsPage() {
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const { listBeneficiaries } = useCyclops({ layer });

  const [activeTab, setActiveTab] = useState<'manual' | 'history' | 'schedule'>('manual');
  const [payoutMode, setPayoutMode] = useState<'client' | 'beneficiary'>('client');

  // Manual payout state
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [beneficiaryIds, setBeneficiaryIds] = useState<string[]>([]);
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<string>('');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [calculation, setCalculation] = useState<PayoutCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountOption[]>([]);
  const [selectedVirtualAccount, setSelectedVirtualAccount] = useState('');

  // Client payout state
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [clientCalculation, setClientCalculation] = useState<ClientPayoutCalculation | null>(null);
  const [clientPayoutResult, setClientPayoutResult] = useState<{ success: boolean; message: string; deal_id?: string } | null>(null);
  const [clientBeneficiaryIds, setClientBeneficiaryIds] = useState<string[]>([]);
  const [selectedClientVirtualAccount, setSelectedClientVirtualAccount] = useState('');

  // History state
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');

  // Schedule state
  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [cronExpression, setCronExpression] = useState('0 0 1 * *');
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isRunningScheduled, setIsRunningScheduled] = useState(false);

  // Beneficiary name mapping
  const [beneficiaryNames, setBeneficiaryNames] = useState<Record<string, string>>({});

  const inFlight = useRef(new Set<string>());
  const isMounted = useRef(true);
  const loadedTabs = useRef({ manual: false, history: false, schedule: false });

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchWithTimeout = useCallback(async (input: RequestInfo, init?: RequestInit) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const loadBeneficiaries = useCallback(async () => {
    if (inFlight.current.has('beneficiaries')) return;
    inFlight.current.add('beneficiaries');
    try {
      const response = await listBeneficiaries({ is_active: true });
      const list = response.result?.beneficiaries;
      if (Array.isArray(list)) {
        const mapped = list.map((b: BeneficiaryListItem) => ({
          beneficiary_id: b.id || '',
          type: b.legal_type === 'F' ? 'fl' : b.legal_type === 'I' ? 'ip' : 'ul',
          inn: b.inn,
          name: b.beneficiary_data?.name,
          first_name: b.beneficiary_data?.first_name,
          last_name: b.beneficiary_data?.last_name,
          is_active: b.is_active,
        })) as Beneficiary[];
        setBeneficiaries(mapped.filter((b) => b.beneficiary_id));
        const names: Record<string, string> = {};
        mapped.forEach((b: Beneficiary) => {
          names[b.beneficiary_id] = b.name ||
            (b.first_name && b.last_name ? `${b.last_name} ${b.first_name}` : b.inn);
        });
        if (isMounted.current) {
          setBeneficiaryNames(names);
        }
      }
    } catch (error) {
      console.error('Failed to load beneficiaries:', error);
    } finally {
      inFlight.current.delete('beneficiaries');
    }
  }, [listBeneficiaries]);

  const loadClients = useCallback(async () => {
    if (inFlight.current.has('clients')) return;
    inFlight.current.add('clients');
    try {
      const response = await fetchWithTimeout('/api/clients?is_active=true');
      const data = await response.json();
      if (data.clients && isMounted.current) {
        setClients(data.clients.filter((c: ClientItem) => c.machine_count > 0));
      }
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      inFlight.current.delete('clients');
    }
  }, [fetchWithTimeout]);

  const loadClientMachines = useCallback(async (clientId: string) => {
    if (!clientId) {
      setClientBeneficiaryIds([]);
      return;
    }
    const key = `client_machines_${clientId}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const response = await fetchWithTimeout(`/api/clients/${clientId}/machines`);
      const data = await response.json();
      const assigned = Array.isArray(data?.assigned) ? (data.assigned as ClientMachineItem[]) : [];
      const beneficiaryIds = assigned
        .map((m) => (m.beneficiary_id ? String(m.beneficiary_id) : ''))
        .filter((id) => Boolean(id));
      setClientBeneficiaryIds(Array.from(new Set(beneficiaryIds)));
    } catch (error) {
      console.error('Failed to load client machines:', error);
      setClientBeneficiaryIds([]);
    } finally {
      inFlight.current.delete(key);
    }
  }, [fetchWithTimeout]);

  const loadBeneficiaryIds = useCallback(async () => {
    if (inFlight.current.has('beneficiary_ids')) return;
    inFlight.current.add('beneficiary_ids');
    try {
      const response = await fetchWithTimeout('/api/payouts?action=beneficiaries_with_machines');
      const data = await response.json();
      if (data.beneficiary_ids && isMounted.current) {
        setBeneficiaryIds(data.beneficiary_ids);
      }
    } catch (error) {
      console.error('Failed to load beneficiary IDs:', error);
    } finally {
      inFlight.current.delete('beneficiary_ids');
    }
  }, [fetchWithTimeout]);

  const loadVirtualAccounts = useCallback(async () => {
    if (inFlight.current.has('virtual_accounts')) return;
    inFlight.current.add('virtual_accounts');
    try {
      const response = await fetchWithTimeout('/api/virtual-accounts?type=standard');
      const data = await response.json();
      const accounts = data?.virtual_accounts || data?.result?.virtual_accounts || [];
      if (Array.isArray(accounts) && isMounted.current) {
        setVirtualAccounts(accounts.map((acc: unknown) => {
          if (typeof acc === 'string') {
            return { id: acc };
          }
          const accObj = acc as { id?: string; virtual_account?: string; code?: string; balance?: number; cash?: number; beneficiary_id?: string };
          return {
            id: accObj.id || accObj.virtual_account || accObj.code || '',
            balance: typeof accObj.balance === 'number' ? accObj.balance : accObj.cash,
            beneficiary_id: accObj.beneficiary_id,
          } as VirtualAccountOption;
        }).filter((acc: VirtualAccountOption) => acc.id));
      }
    } catch (error) {
      console.error('Failed to load virtual accounts:', error);
    } finally {
      inFlight.current.delete('virtual_accounts');
    }
  }, [fetchWithTimeout]);

  const loadPayoutHistory = useCallback(async () => {
    if (inFlight.current.has('history')) return;
    inFlight.current.add('history');
    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams({ action: 'history' });
      if (historyFilter !== 'all') {
        params.set('status', historyFilter);
      }
      const response = await fetchWithTimeout(`/api/payouts?${params}`);
      const data = await response.json();
      if (data.payouts && isMounted.current) {
        setPayouts(data.payouts);
      }
    } catch (error) {
      console.error('Failed to load payout history:', error);
    } finally {
      if (isMounted.current) {
        setIsLoadingHistory(false);
      }
      inFlight.current.delete('history');
    }
  }, [fetchWithTimeout, historyFilter]);

  const loadSchedule = useCallback(async () => {
    if (inFlight.current.has('schedule')) return;
    inFlight.current.add('schedule');
    try {
      const response = await fetchWithTimeout('/api/payouts?action=schedule');
      const data = await response.json();
      if (data.schedule && isMounted.current) {
        setSchedule(data.schedule);
        setCronExpression(data.schedule.cron_expression);
        setIsScheduleEnabled(data.schedule.is_enabled);
      }
    } catch (error) {
      console.error('Failed to load schedule:', error);
    } finally {
      inFlight.current.delete('schedule');
    }
  }, [fetchWithTimeout]);

  useEffect(() => {
    if (activeTab === 'manual') {
      if (!loadedTabs.current.manual) {
        loadedTabs.current.manual = true;
        loadClients();
        loadBeneficiaries();
        loadBeneficiaryIds();
        loadVirtualAccounts();
      }
      return;
    }

    if (activeTab === 'history') {
      if (!loadedTabs.current.history) {
        loadedTabs.current.history = true;
        loadBeneficiaries();
        loadPayoutHistory();
      }
      return;
    }

    if (activeTab === 'schedule') {
      if (!loadedTabs.current.schedule) {
        loadedTabs.current.schedule = true;
        loadSchedule();
      }
    }
  }, [activeTab, loadClients, loadBeneficiaries, loadBeneficiaryIds, loadPayoutHistory, loadSchedule, loadVirtualAccounts]);

  useEffect(() => {
    if (!selectedClient) {
      setClientBeneficiaryIds([]);
      setSelectedClientVirtualAccount('');
      return;
    }
    loadClientMachines(selectedClient);
  }, [selectedClient, loadClientMachines]);

  const hasBeneficiaryAccounts = virtualAccounts.some((va) => Boolean(va.beneficiary_id));
  const filteredVirtualAccounts = selectedBeneficiary && hasBeneficiaryAccounts
    ? virtualAccounts.filter((va) => va.beneficiary_id === selectedBeneficiary)
    : virtualAccounts;

  useEffect(() => {
    if (selectedBeneficiary && filteredVirtualAccounts.length === 1) {
      setSelectedVirtualAccount(filteredVirtualAccounts[0].id);
      return;
    }
    if (selectedVirtualAccount && !filteredVirtualAccounts.some((va) => va.id === selectedVirtualAccount)) {
      setSelectedVirtualAccount('');
    }
  }, [filteredVirtualAccounts, selectedBeneficiary, selectedVirtualAccount]);

  const clientBeneficiarySet = new Set(clientBeneficiaryIds);
  const filteredClientVirtualAccounts = clientBeneficiarySet.size > 0 && hasBeneficiaryAccounts
    ? virtualAccounts.filter((va) => va.beneficiary_id && clientBeneficiarySet.has(va.beneficiary_id))
    : virtualAccounts;

  useEffect(() => {
    if (selectedClient && filteredClientVirtualAccounts.length === 1) {
      setSelectedClientVirtualAccount(filteredClientVirtualAccounts[0].id);
      return;
    }
    if (selectedClientVirtualAccount && !filteredClientVirtualAccounts.some((va) => va.id === selectedClientVirtualAccount)) {
      setSelectedClientVirtualAccount('');
    }
  }, [filteredClientVirtualAccounts, selectedClient, selectedClientVirtualAccount]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadPayoutHistory();
    }
  }, [activeTab, loadPayoutHistory]);

  const handleCalculate = async () => {
    if (!selectedBeneficiary) return;

    setIsCalculating(true);
    setCalculation(null);

    try {
      const response = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calculate',
          beneficiary_id: selectedBeneficiary,
          end_date: endDate,
        }),
      });

      const data = await response.json();
      if (data.calculation) {
        setCalculation(data.calculation);
      }
    } catch (error) {
      console.error('Failed to calculate payout:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleClientCalculate = async () => {
    if (!selectedClient) return;
    setIsCalculating(true);
    setClientCalculation(null);
    setClientPayoutResult(null);
    try {
      const startDate = getDefaultStartDate(endDate);
      const response = await fetch(`/api/clients/${selectedClient}/payout?layer=${layer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calculate', end_date: endDate, start_date: startDate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка расчёта');
      setClientCalculation(data.calculation);
    } catch (error) {
      console.error('Failed to calculate client payout:', error);
      alert(error instanceof Error ? error.message : 'Ошибка расчёта');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleClientExecute = async () => {
    if (!clientCalculation || clientCalculation.payout_amount <= 0) return;
    if (!confirm(`Выполнить выплату ${formatMoney(clientCalculation.payout_amount)} клиенту "${clientCalculation.client_name}"?`)) return;
    setIsExecuting(true);
    setClientPayoutResult(null);
    try {
      const startDate = clientCalculation.period_start || getDefaultStartDate(endDate);
      const response = await fetch(`/api/clients/${selectedClient}/payout?layer=${layer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          end_date: endDate,
          start_date: startDate,
          virtual_account: selectedClientVirtualAccount || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setClientPayoutResult({ success: false, message: data.error || 'Ошибка выплаты' });
        return;
      }
      setClientPayoutResult({
        success: true,
        message: `Выплата выполнена! Deal ID: ${data.cyclops_deal_id}`,
        deal_id: data.cyclops_deal_id,
      });
      addRecentAction({
        type: 'Выплата',
        description: `Выплата ${formatMoney(clientCalculation.payout_amount)} клиенту ${clientCalculation.client_name}`,
        layer,
      });
      setClientCalculation(null);
    } catch (error) {
      setClientPayoutResult({
        success: false,
        message: error instanceof Error ? error.message : 'Ошибка',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExecutePayout = async () => {
    if (!calculation || calculation.payout_amount <= 0) return;
    if (!selectedVirtualAccount) {
      alert('Выберите виртуальный счёт для выплаты');
      return;
    }

    setIsExecuting(true);

    try {
      const response = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          beneficiary_id: calculation.beneficiary_id,
          end_date: endDate,
          virtual_account: selectedVirtualAccount,
        }),
      });

      const data = await response.json();
      if (data.success) {
        addRecentAction({
          type: 'Выплата',
          description: `Создана выплата ${formatMoney(calculation.payout_amount)} для ${beneficiaryNames[calculation.beneficiary_id] || calculation.beneficiary_id}`,
          layer,
        });
        setCalculation(null);
        setSelectedBeneficiary('');
        setActiveTab('history');
        loadPayoutHistory();
      } else {
        alert(data.error || 'Ошибка при создании выплаты');
      }
    } catch (error) {
      console.error('Failed to execute payout:', error);
      alert('Ошибка при создании выплаты');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true);

    try {
      const response = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_schedule',
          cron_expression: cronExpression,
          is_enabled: isScheduleEnabled,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSchedule(data.schedule);
        addRecentAction({
          type: 'Настройка',
          description: `Расписание автоматических выплат ${isScheduleEnabled ? 'включено' : 'отключено'}`,
          layer,
        });
      }
    } catch (error) {
      console.error('Failed to save schedule:', error);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleRunScheduledPayouts = async () => {
    if (!confirm('Вы уверены, что хотите запустить расчёт выплат для всех бенефициаров?')) return;

    setIsRunningScheduled(true);

    try {
      const response = await fetch('/api/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_scheduled',
        }),
      });

      const data = await response.json();
      if (data.success) {
        addRecentAction({
          type: 'Массовая выплата',
          description: `Создано ${data.summary.created} выплат из ${data.summary.total} бенефициаров`,
          layer,
        });
        setActiveTab('history');
        loadPayoutHistory();
      }
    } catch (error) {
      console.error('Failed to run scheduled payouts:', error);
    } finally {
      setIsRunningScheduled(false);
    }
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return isDateOnly ? parsed.toLocaleDateString('ru-RU') : parsed.toLocaleString('ru-RU');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="badge badge-success">Выполнена</span>;
      case 'processing':
        return <span className="badge badge-warning">Обработка</span>;
      case 'failed':
        return <span className="badge badge-error">Ошибка</span>;
      default:
        return <span className="badge badge-neutral">Ожидание</span>;
    }
  };

  const getCronDescription = (cron: string) => {
    // Простые описания для типовых значений
    const descriptions: Record<string, string> = {
      '0 0 1 * *': '1-го числа каждого месяца в 00:00',
      '0 0 15 * *': '15-го числа каждого месяца в 00:00',
      '0 0 * * 1': 'Каждый понедельник в 00:00',
      '0 0 * * *': 'Каждый день в 00:00',
    };
    return descriptions[cron] || cron;
  };

  const filteredBeneficiaries = beneficiaries.filter(b =>
    beneficiaryIds.includes(b.beneficiary_id)
  );

  return (
    <div className="payouts-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Выплаты</h1>
          <p className="page-description">
            Расчёт и выполнение выплат клиентам на основе данных Vendista
          </p>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          Ручная выплата
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          История выплат
        </button>
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Автоматические выплаты
        </button>
      </div>

      {/* Manual Payout Tab */}
      {activeTab === 'manual' && (
        <div className="manual-payout">
          {/* Mode Switcher */}
          <div className="mode-switcher">
            <button
              className={`mode-btn ${payoutMode === 'client' ? 'active' : ''}`}
              onClick={() => { setPayoutMode('client'); setCalculation(null); setClientCalculation(null); }}
            >
              По клиентам
            </button>
            <button
              className={`mode-btn ${payoutMode === 'beneficiary' ? 'active' : ''}`}
              onClick={() => { setPayoutMode('beneficiary'); setCalculation(null); setClientCalculation(null); }}
            >
              По бенефициарам (старый)
            </button>
          </div>

          {/* Client payout form */}
          {payoutMode === 'client' && (
            <div className="card">
              <h2 className="card-title">Выплата клиенту</h2>

              {clientPayoutResult && (
                <div className={`result-banner ${clientPayoutResult.success ? 'success' : 'error'}`}>
                  <p>{clientPayoutResult.message}</p>
                  {clientPayoutResult.deal_id && (
                    <a href={`/deals/${clientPayoutResult.deal_id}`} className="result-link">
                      Открыть сделку в Cyclops
                    </a>
                  )}
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Клиент</label>
                  <select
                    className="form-input form-select"
                    value={selectedClient}
                    onChange={(e) => {
                      setSelectedClient(e.target.value);
                      setClientCalculation(null);
                      setClientPayoutResult(null);
                      setSelectedClientVirtualAccount('');
                    }}
                  >
                    <option value="">Выберите клиента</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.inn ? `(${c.inn})` : ''} — {c.machine_count} авт. [{PAYOUT_TYPE_LABELS[c.payout_type]}]
                      </option>
                    ))}
                  </select>
                  {clients.length === 0 && (
                    <span className="form-hint">
                      Нет клиентов с привязанными автоматами.{' '}
                      <a href="/clients/create">Создать клиента</a>
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Виртуальный счёт (плательщик)</label>
                  <select
                    className="form-input form-select"
                    value={selectedClientVirtualAccount}
                    onChange={(e) => setSelectedClientVirtualAccount(e.target.value)}
                    disabled={!selectedClient}
                  >
                    <option value="">Выберите счёт</option>
                    {filteredClientVirtualAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.id}
                        {typeof account.balance === 'number'
                          ? ` — ${new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(account.balance)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  {selectedClient && filteredClientVirtualAccounts.length === 0 && (
                    <span className="form-hint">Нет доступных виртуальных счетов для выбранного клиента</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Дата окончания периода</label>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setClientCalculation(null);
                    }}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={handleClientCalculate}
                disabled={!selectedClient || isCalculating}
              >
                {isCalculating ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    Расчёт...
                  </>
                ) : (
                  'Рассчитать'
                )}
              </button>

              {clientCalculation && (
                <div className="calculation-result" style={{ marginTop: 24 }}>
                  <h3 className="section-title">Результат расчёта — {clientCalculation.client_name}</h3>

                  <div className="calculation-summary">
                    <div className="summary-item">
                      <span className="summary-label">Период</span>
                      <span className="summary-value">
                        {formatDate(clientCalculation.period_start)} — {formatDate(clientCalculation.period_end)}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Продажи</span>
                      <span className="summary-value money">{formatMoney(clientCalculation.total_sales)}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Комиссия</span>
                      <span className="summary-value money money-negative">-{formatMoney(clientCalculation.total_commission)}</span>
                    </div>
                    <div className="summary-item highlight">
                      <span className="summary-label">К выплате</span>
                      <span className="summary-value money money-positive">{formatMoney(clientCalculation.payout_amount)}</span>
                    </div>
                  </div>

                  {clientCalculation.machines.length > 0 && (
                    <div className="machines-breakdown">
                      <div className="table-wrapper">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Автомат</th>
                              <th>Продажи</th>
                              <th>Комиссия</th>
                              <th>К выплате</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clientCalculation.machines.map((m) => (
                              <tr key={m.machine_id}>
                                <td>
                                  <span className="code">{m.vendista_id}</span>
                                  {m.machine_name && <span className="machine-name"> — {m.machine_name}</span>}
                                </td>
                                <td className="money">{formatMoney(m.sales_amount)}</td>
                                <td className="money money-negative">
                                  -{formatMoney(m.commission_amount)} ({m.commission_percent}%)
                                </td>
                                <td className="money money-positive">{formatMoney(m.net_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {clientCalculation.payout_amount > 0 && (
                    <div className="calculation-actions">
                      <button
                        className="btn btn-primary"
                        onClick={handleClientExecute}
                        disabled={isExecuting}
                      >
                        {isExecuting ? (
                          <>
                            <div className="spinner" style={{ width: 16, height: 16 }} />
                            Создание сделки...
                          </>
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 11 12 14 22 4" />
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                            Выплатить {formatMoney(clientCalculation.payout_amount)} (Cyclops Deal)
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Beneficiary payout form (legacy) */}
          {payoutMode === 'beneficiary' && (
          <div className="card">
            <h2 className="card-title">Расчёт выплаты (по бенефициару)</h2>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Бенефициар</label>
                <select
                  className="form-input form-select"
                  value={selectedBeneficiary}
                  onChange={(e) => {
                    setSelectedBeneficiary(e.target.value);
                    setCalculation(null);
                    setSelectedVirtualAccount('');
                  }}
                >
                  <option value="">Выберите бенефициара</option>
                  {filteredBeneficiaries.map((b) => (
                    <option key={b.beneficiary_id} value={b.beneficiary_id}>
                      {beneficiaryNames[b.beneficiary_id]} ({b.inn})
                    </option>
                  ))}
                </select>
                {filteredBeneficiaries.length === 0 && (
                  <span className="form-hint">
                    Нет бенефициаров с привязанными автоматами
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Виртуальный счёт (плательщик)</label>
                <select
                  className="form-input form-select"
                  value={selectedVirtualAccount}
                  onChange={(e) => setSelectedVirtualAccount(e.target.value)}
                  disabled={!selectedBeneficiary}
                >
                  <option value="">Выберите счёт</option>
                  {filteredVirtualAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.id}
                      {typeof account.balance === 'number'
                        ? ` — ${new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(account.balance)}`
                        : ''}
                    </option>
                  ))}
                </select>
                {selectedBeneficiary && filteredVirtualAccounts.length === 0 && (
                  <span className="form-hint">Нет доступных виртуальных счетов для выбранного бенефициара</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Дата окончания периода</label>
                <input
                  type="date"
                  className="form-input"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setCalculation(null);
                  }}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            <button
              className="btn btn-secondary"
              onClick={handleCalculate}
              disabled={!selectedBeneficiary || isCalculating}
            >
              {isCalculating ? (
                <>
                  <div className="spinner" style={{ width: 16, height: 16 }} />
                  Расчёт...
                </>
              ) : (
                'Рассчитать'
              )}
            </button>
          </div>
          )}

          {payoutMode === 'beneficiary' && calculation && (
            <div className="card calculation-result">
              <h2 className="card-title">Результат расчёта</h2>

              <div className="calculation-summary">
                <div className="summary-item">
                  <span className="summary-label">Период</span>
                  <span className="summary-value">
                    {formatDate(calculation.period_start)} — {formatDate(calculation.period_end)}
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Сумма продаж</span>
                  <span className="summary-value money">{formatMoney(calculation.total_sales)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Комиссия</span>
                  <span className="summary-value money money-negative">-{formatMoney(calculation.total_commission)}</span>
                </div>
                <div className="summary-item highlight">
                  <span className="summary-label">К выплате</span>
                  <span className="summary-value money money-positive">{formatMoney(calculation.payout_amount)}</span>
                </div>
              </div>

              {calculation.machines.length > 0 && (
                <div className="machines-breakdown">
                  <h3 className="section-title">Детализация по автоматам</h3>
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Автомат</th>
                          <th>Продажи</th>
                          <th>Комиссия</th>
                          <th>К выплате</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calculation.machines.map((m) => (
                          <tr key={m.machine_id}>
                            <td>
                              <span className="code">{m.vendista_id}</span>
                              {m.machine_name && <span className="machine-name"> — {m.machine_name}</span>}
                            </td>
                            <td className="money">{formatMoney(m.sales_amount)}</td>
                            <td className="money money-negative">
                              -{formatMoney(m.commission_amount)} ({m.commission_percent}%)
                            </td>
                            <td className="money money-positive">{formatMoney(m.net_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="calculation-actions">
                {calculation.payout_amount > 0 ? (
                  <button
                    className="btn btn-primary"
                    onClick={handleExecutePayout}
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <>
                        <div className="spinner" style={{ width: 16, height: 16 }} />
                        Выполнение...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                        Выплатить {formatMoney(calculation.payout_amount)}
                      </>
                    )}
                  </button>
                ) : (
                  <p className="no-payout-message">
                    Нет суммы к выплате за выбранный период
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="payout-history">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">История выплат</h2>
              <div className="history-filters">
                <select
                  className="form-input form-select"
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}
                  style={{ width: 'auto' }}
                >
                  <option value="all">Все</option>
                  <option value="pending">Ожидание</option>
                  <option value="completed">Выполненные</option>
                  <option value="failed">С ошибкой</option>
                </select>
              </div>
            </div>

            {isLoadingHistory ? (
              <div className="loading-state">
                <div className="spinner" />
                <span>Загрузка...</span>
              </div>
            ) : payouts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <p className="empty-state-title">Нет выплат</p>
                <p className="empty-state-description">
                  История выплат появится после первой выплаты
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Бенефициар</th>
                      <th>Период</th>
                      <th>Продажи</th>
                      <th>Комиссия</th>
                      <th>Выплачено</th>
                      <th>Статус</th>
                      <th>Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((payout) => (
                      <tr key={payout.id}>
                        <td>
                          {beneficiaryNames[payout.beneficiary_id] || payout.beneficiary_id}
                        </td>
                        <td>
                          {formatDate(payout.period_start)} — {formatDate(payout.period_end)}
                        </td>
                        <td className="money">{formatMoney(payout.total_sales)}</td>
                        <td className="money money-negative">-{formatMoney(payout.commission_amount)}</td>
                        <td className="money money-positive">{formatMoney(payout.payout_amount)}</td>
                        <td>{getStatusBadge(payout.status)}</td>
                        <td>{formatDate(payout.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {activeTab === 'schedule' && (
        <div className="payout-schedule">
          <div className="card">
            <h2 className="card-title">Автоматические выплаты</h2>

            <div className="schedule-toggle">
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={isScheduleEnabled}
                  onChange={(e) => setIsScheduleEnabled(e.target.checked)}
                />
                <span>Включить автоматические выплаты</span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">Расписание (cron)</label>
              <select
                className="form-input form-select"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
              >
                <option value="0 0 1 * *">1-го числа каждого месяца</option>
                <option value="0 0 15 * *">15-го числа каждого месяца</option>
                <option value="0 0 * * 1">Каждый понедельник</option>
                <option value="0 0 * * *">Каждый день</option>
              </select>
              <span className="form-hint">
                {getCronDescription(cronExpression)}
              </span>
            </div>

            {schedule && (
              <div className="schedule-info">
                <div className="info-item">
                  <span className="info-label">Последний запуск</span>
                  <span className="info-value">
                    {schedule.last_run_at ? formatDate(schedule.last_run_at) : 'Никогда'}
                  </span>
                </div>
              </div>
            )}

            <div className="schedule-actions">
              <button
                className="btn btn-primary"
                onClick={handleSaveSchedule}
                disabled={isSavingSchedule}
              >
                {isSavingSchedule ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить настройки'
                )}
              </button>

              <button
                className="btn btn-secondary"
                onClick={handleRunScheduledPayouts}
                disabled={isRunningScheduled}
              >
                {isRunningScheduled ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    Выполнение...
                  </>
                ) : (
                  'Запустить сейчас'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .payouts-page {
          max-width: 1200px;
        }

        .mode-switcher {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
          width: fit-content;
        }

        .mode-btn {
          padding: 8px 20px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.15s ease;
        }

        .mode-btn.active {
          background: var(--bg-primary);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        .result-banner {
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .result-banner.success {
          background: #dcfce7;
          color: #166534;
        }

        .result-banner.error {
          background: #fef2f2;
          color: #dc2626;
        }

        .result-banner p {
          margin: 0 0 4px;
        }

        .result-link {
          color: inherit;
          font-weight: 500;
          text-decoration: underline;
        }

        .form-row {
          display: flex;
          gap: 16px;
          margin-bottom: 16px;
        }

        .form-row > .form-group {
          flex: 1;
          margin-bottom: 0;
        }

        .calculation-result {
          margin-top: 24px;
        }

        .calculation-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 24px;
          margin-bottom: 24px;
          padding: 20px;
          background: var(--bg-secondary);
          border-radius: 12px;
        }

        .summary-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .summary-item.highlight {
          padding: 16px;
          background: var(--accent-bg);
          border-radius: 8px;
          margin: -8px;
        }

        .summary-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-tertiary);
          text-transform: uppercase;
        }

        .summary-value {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .machines-breakdown {
          margin-top: 24px;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 16px;
        }

        .machine-name {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .calculation-actions {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--border-color);
        }

        .no-payout-message {
          color: var(--text-tertiary);
          font-style: italic;
        }

        .history-filters {
          display: flex;
          gap: 8px;
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
        }

        .schedule-toggle {
          margin-bottom: 24px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 12px;
        }

        .schedule-info {
          margin: 24px 0;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 12px;
        }

        .schedule-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .info-label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .info-value {
          font-size: 14px;
          font-weight: 500;
        }

        @media (max-width: 767px) {
          .form-row {
            flex-direction: column;
            gap: 0;
          }

          .form-row > .form-group {
            margin-bottom: 16px;
          }

          .calculation-summary {
            grid-template-columns: 1fr 1fr;
          }

          .schedule-actions {
            flex-direction: column;
          }

          .schedule-actions .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
