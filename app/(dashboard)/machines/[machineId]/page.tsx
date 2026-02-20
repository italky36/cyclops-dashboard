'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface MachineInfo {
  id: number;
  vendista_id: string;
  name: string | null;
  model: string | null;
  address: string | null;
  serial_number: string | null;
  terminal_id: string | null;
  is_active: boolean;
  synced_at: string;
  created_at: string;
}

interface Assignment {
  id: number;
  machine_id: number;
  client_id: number | null;
  client_name: string | null;
  commission_percent: number;
  assigned_at: string;
}

interface Transaction {
  id: string | number;
  machine_id: string | number;
  date: string;
  amount: number;
  type?: string | null;
  product_name?: string | null;
}

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ru-RU');
};

const formatMoney = (value: number) =>
  value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getDefaultDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
};

export default function MachineDetailPage() {
  const params = useParams();
  const machineId = params.machineId as string;

  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txLoaded, setTxLoaded] = useState(false);

  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);

  // Load machine info
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/vendista?action=machine&id=${machineId}`);
        const data = await res.json();
        if (data.machine) setMachine(data.machine);

        const assignRes = await fetch('/api/assignments?action=all_active');
        const assignData = await assignRes.json();
        const found = assignData.assignments?.find(
          (a: { machine_id: number }) => a.machine_id === Number(machineId)
        );
        if (found) setAssignment(found);
      } catch (err) {
        console.error('Failed to load machine:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [machineId]);

  const loadTransactions = async () => {
    if (!machine?.terminal_id) {
      setTxError('У автомата нет terminal_id — невозможно загрузить транзакции');
      return;
    }

    setTxLoading(true);
    setTxError(null);
    try {
      const res = await fetch('/api/vendista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fetch_transactions',
          term_id: machine.terminal_id,
          startDate,
          endDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTxError(data.error || 'Ошибка загрузки транзакций');
        return;
      }
      setTransactions(data.transactions || []);
      setTxLoaded(true);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setTxLoading(false);
    }
  };

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  if (loading) {
    return (
      <div className="page">
        <div className="loading-state">
          <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p>Загрузка...</p>
        </div>
        <style jsx>{`
          .page { padding: 24px; }
          .loading-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; color: var(--text-secondary); }
          .spin { animation: spin 1s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="page">
        <div className="empty-state">
          <h3>Автомат не найден</h3>
          <Link href="/machines" className="back-link">← Вернуться к списку</Link>
        </div>
        <style jsx>{`
          .page { padding: 24px; }
          .empty-state { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
          .empty-state h3 { color: var(--text-primary); margin-bottom: 16px; }
          .back-link { color: var(--accent-color); text-decoration: none; }
          .back-link:hover { text-decoration: underline; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <Link href="/machines" className="back-link">← Все автоматы</Link>
          <h1>{machine.name || `Автомат #${machine.id}`}</h1>
          <div className="header-meta">
            <span className={`badge ${machine.is_active ? 'badge-success' : 'badge-secondary'}`}>
              {machine.is_active ? 'Активен' : 'Неактивен'}
            </span>
            {machine.terminal_id && (
              <span className="meta-item">Terminal: <strong>{machine.terminal_id}</strong></span>
            )}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="info-grid">
        <div className="info-card">
          <div className="info-label">Terminal ID</div>
          <div className="info-value mono">{machine.terminal_id || '—'}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Vendista ID</div>
          <div className="info-value mono">{machine.vendista_id}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Серийный номер</div>
          <div className="info-value">{machine.serial_number || '—'}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Модель</div>
          <div className="info-value">{machine.model || '—'}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Адрес</div>
          <div className="info-value">{machine.address || '—'}</div>
        </div>
        <div className="info-card">
          <div className="info-label">Последняя синхронизация</div>
          <div className="info-value">{machine.synced_at ? formatDate(machine.synced_at) : '—'}</div>
        </div>
        {assignment && (
          <>
            <div className="info-card">
              <div className="info-label">Клиент</div>
              <div className="info-value">
                {assignment.client_id ? (
                  <Link href={`/clients/${assignment.client_id}`} className="link">
                    {assignment.client_name || `Клиент #${assignment.client_id}`}
                  </Link>
                ) : '—'}
              </div>
            </div>
            <div className="info-card">
              <div className="info-label">Комиссия</div>
              <div className="info-value">{assignment.commission_percent}%</div>
            </div>
          </>
        )}
      </div>

      {/* Transactions section */}
      <div className="section">
        <div className="section-header">
          <h2>Транзакции Vendista</h2>
        </div>

        <div className="period-bar">
          <div className="period-field">
            <label>С</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div className="period-field">
            <label>По</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <button
            className="btn-primary"
            onClick={loadTransactions}
            disabled={txLoading || !machine.terminal_id}
          >
            {txLoading ? 'Загрузка...' : 'Загрузить'}
          </button>
        </div>

        {!machine.terminal_id && (
          <div className="alert alert-warning">
            У автомата нет terminal_id — загрузка транзакций невозможна.
          </div>
        )}

        {txError && (
          <div className="alert alert-danger">{txError}</div>
        )}

        {txLoaded && (
          <>
            <div className="tx-summary">
              <div className="summary-item">
                <span className="summary-label">Транзакций:</span>
                <span className="summary-value">{transactions.length}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Сумма:</span>
                <span className="summary-value">{formatMoney(totalAmount)} ₽</span>
              </div>
            </div>

            {transactions.length === 0 ? (
              <div className="empty-state-sm">
                Нет транзакций за выбранный период
              </div>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Сумма</th>
                      <th>Тип</th>
                      <th>Продукт</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={`${tx.id}-${i}`}>
                        <td>{formatDate(tx.date)}</td>
                        <td className="amount">{formatMoney(tx.amount)} ₽</td>
                        <td>{tx.type || '—'}</td>
                        <td>{tx.product_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .page {
          padding: 24px;
        }

        .page-header {
          margin-bottom: 24px;
        }

        .back-link {
          color: var(--accent-color);
          text-decoration: none;
          font-size: 14px;
          display: inline-block;
          margin-bottom: 8px;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        h1 {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .header-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .meta-item {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .meta-item strong {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
          color: var(--text-primary);
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-secondary {
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
          margin-bottom: 32px;
        }

        .info-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 16px;
        }

        .info-label {
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .info-value {
          font-size: 15px;
          font-weight: 500;
          color: var(--text-primary);
          word-break: break-all;
        }

        .info-value.mono {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
          font-size: 14px;
        }

        .link {
          color: var(--accent-color);
          text-decoration: none;
          font-weight: 500;
        }

        .link:hover {
          text-decoration: underline;
        }

        .section {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 24px;
        }

        .section-header {
          margin-bottom: 20px;
        }

        .section-header h2 {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .period-bar {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .period-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .period-field label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .input {
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-primary);
          background: var(--bg-primary);
          outline: none;
        }

        .input:focus {
          border-color: var(--accent-color);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: var(--accent-color);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .alert {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 16px;
        }

        .alert-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fbbf24;
        }

        .alert-danger {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }

        .tx-summary {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: var(--bg-tertiary);
          border-radius: 8px;
        }

        .summary-label {
          font-size: 14px;
          color: var(--text-secondary);
          margin-right: 6px;
        }

        .summary-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .empty-state-sm {
          text-align: center;
          padding: 32px;
          color: var(--text-tertiary);
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

        .data-table thead {
          background: var(--bg-tertiary);
        }

        .data-table th {
          text-align: left;
          padding: 10px 16px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-color);
        }

        .data-table td {
          padding: 12px 16px;
          font-size: 14px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-color);
        }

        .data-table tbody tr:last-child td {
          border-bottom: none;
        }

        .data-table tbody tr:hover {
          background: var(--bg-hover);
        }

        .amount {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
          font-weight: 500;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 60px 20px;
          color: var(--text-secondary);
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .page {
            padding: 16px;
          }

          .info-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .period-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .table-container {
            overflow-x: auto;
          }

          .data-table {
            min-width: 500px;
          }
        }
      `}</style>
    </div>
  );
}
