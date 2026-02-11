'use client';

import { useState, useEffect, useCallback } from 'react';
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
  sbp_phone: string | null;
  sbp_bank_id: string | null;
  sbp_first_name: string | null;
  sbp_middle_name: string | null;
  sbp_last_name: string | null;
  card_first_name: string | null;
  card_middle_name: string | null;
  card_last_name: string | null;
  beneficiary_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  payment_contract: 'Банковский перевод',
  payment_contract_by_sbp_v2: 'СБП',
  payment_contract_to_card: 'На карту',
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
  const [selectedMachine, setSelectedMachine] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('10');
  const [isAssigning, setIsAssigning] = useState(false);

  // Payout
  const [calculation, setCalculation] = useState<PayoutCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [payoutResult, setPayoutResult] = useState<{ success: boolean; message: string; deal_id?: string } | null>(null);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const loadClient = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}`);
      if (!res.ok) throw new Error('Ошибка загрузки клиента');
      const data = await res.json();
      setClient(data.client);
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

  useEffect(() => {
    loadClient();
    loadMachines();
  }, [loadClient, loadMachines]);

  const handleAssignMachine = async () => {
    if (!selectedMachine) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/machines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: selectedMachine,
          commission_percent: parseFloat(commissionPercent),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка привязки');
      }
      addRecentAction(`Привязан автомат к клиенту ${client?.name}`);
      setShowAssign(false);
      setSelectedMachine('');
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

  const handleCalculate = async () => {
    setIsCalculating(true);
    setCalculation(null);
    setPayoutResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/payout?layer=${layer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'calculate', end_date: endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка расчёта');
      setCalculation(data.calculation);
    } catch (err) {
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
      const res = await fetch(`/api/clients/${clientId}/payout?layer=${layer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute', end_date: endDate }),
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
      addRecentAction(`Выплата ${calculation.payout_amount.toFixed(2)} руб. клиенту ${client?.name}`);
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

  if (isLoading) return <div style={{ padding: 24 }}>Загрузка...</div>;
  if (error) return <div style={{ padding: 24, color: 'var(--error-color)' }}>{error}</div>;
  if (!client) return <div style={{ padding: 24 }}>Клиент не найден</div>;

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
            {client.payout_type === 'payment_contract_by_sbp_v2' && (
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
          </div>
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
            <select
              value={selectedMachine}
              onChange={(e) => setSelectedMachine(e.target.value)}
              className="input"
            >
              <option value="">Выберите автомат</option>
              {unassignedMachines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.vendista_id} {m.address ? `(${m.address})` : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              className="input"
              placeholder="Комиссия %"
              style={{ width: 120 }}
              min={0}
              max={100}
              step={0.1}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={handleAssignMachine}
              disabled={!selectedMachine || isAssigning}
            >
              {isAssigning ? '...' : 'Привязать'}
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
                  <th>Комиссия</th>
                  <th>Привязан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr key={m.assignment_id}>
                    <td>{m.name || m.vendista_id}</td>
                    <td className="text-secondary">{m.address || '—'}</td>
                    <td>{m.commission_percent}%</td>
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
          <div className="form-group">
            <label>Дата окончания периода</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleCalculate}
            disabled={isCalculating || machines.length === 0}
          >
            {isCalculating ? 'Расчёт...' : 'Рассчитать'}
          </button>
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
                <strong>{calculation.period_start} — {calculation.period_end}</strong>
              </div>
              <div className="calc-item">
                <span>Общие продажи:</span>
                <strong>{calculation.total_sales.toFixed(2)} руб.</strong>
              </div>
              <div className="calc-item">
                <span>Комиссия платформы:</span>
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
                  disabled={isExecuting}
                >
                  {isExecuting
                    ? 'Выполнение выплаты...'
                    : `Выполнить выплату ${calculation.payout_amount.toFixed(2)} руб.`}
                </button>
                <p className="text-secondary text-sm" style={{ marginTop: 8 }}>
                  Будет создана и исполнена сделка в Cyclops ({PAYOUT_TYPE_LABELS[client.payout_type]})
                </p>
              </div>
            )}
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
          gap: 12px;
          align-items: flex-end;
          margin-bottom: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
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
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
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
        @media (max-width: 767px) {
          .page-container { padding: 16px; }
          .cards-grid { grid-template-columns: 1fr; }
          .calc-summary { grid-template-columns: 1fr 1fr; }
          .payout-controls { flex-direction: column; }
          .assign-form { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
