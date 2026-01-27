'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface VendingMachine {
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
  assignment?: {
    id: number;
    beneficiary_id: string;
    commission_percent: number;
    assigned_at: string;
  };
  beneficiary_name?: string;
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<VendingMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [vendistaStatus, setVendistaStatus] = useState<{
    configured: boolean;
    base_url: string;
  } | null>(null);

  // Загрузка статуса Vendista
  useEffect(() => {
    fetch('/api/vendista?action=status')
      .then(res => res.json())
      .then(data => setVendistaStatus(data))
      .catch(err => console.error('Failed to load Vendista status:', err));
  }, []);

  // Загрузка автоматов
  const loadMachines = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vendista?action=machines');
      const data = await res.json();

      // Загружаем информацию о привязках
      const assignmentsRes = await fetch('/api/assignments?action=all_active');
      const assignmentsData = await assignmentsRes.json();
      const assignmentsMap = new Map(
        assignmentsData.assignments?.map((a: {
          machine_id: number;
          beneficiary_id: string;
          commission_percent: number;
          assigned_at: string;
          id: number;
        }) => [a.machine_id, a])
      );

      const machinesWithAssignments = data.machines.map((m: VendingMachine) => ({
        ...m,
        assignment: assignmentsMap.get(m.id),
      }));

      setMachines(machinesWithAssignments);
    } catch (error) {
      console.error('Failed to load machines:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMachines();
  }, []);

  // Синхронизация с Vendista
  const handleSync = async () => {
    if (!vendistaStatus?.configured) {
      alert('Vendista API не настроен. Установите VENDISTA_API_KEY в переменных окружения.');
      return;
    }

    setSyncing(true);
    try {
      const res = await fetch('/api/vendista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_machines' }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`Синхронизировано ${data.synced_count} автоматов`);
        await loadMachines();
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  };

  // Фильтрация автоматов
  const filteredMachines = machines.filter(m => {
    // Фильтр по привязке
    if (filter === 'assigned' && !m.assignment) return false;
    if (filter === 'unassigned' && m.assignment) return false;

    // Поиск
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        m.name?.toLowerCase().includes(query) ||
        m.vendista_id.toLowerCase().includes(query) ||
        m.address?.toLowerCase().includes(query) ||
        m.model?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const stats = {
    total: machines.length,
    assigned: machines.filter(m => m.assignment).length,
    unassigned: machines.filter(m => !m.assignment).length,
    active: machines.filter(m => m.is_active).length,
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Торговые автоматы</h1>
          <p className="text-secondary">
            Управление торговыми автоматами и синхронизация с Vendista
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={handleSync}
          disabled={syncing || !vendistaStatus?.configured}
        >
          {syncing ? (
            <>
              <svg className="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Синхронизация...
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              Синхронизировать
            </>
          )}
        </button>
      </div>

      {!vendistaStatus?.configured && (
        <div className="alert alert-warning">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <strong>Vendista API не настроен</strong>
            <p>Установите VENDISTA_API_KEY в переменных окружения для синхронизации автоматов</p>
          </div>
        </div>
      )}

      {/* Статистика */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Всего автоматов</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Привязано</div>
          <div className="stat-value">{stats.assigned}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Не привязано</div>
          <div className="stat-value">{stats.unassigned}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Активных</div>
          <div className="stat-value">{stats.active}</div>
        </div>
      </div>

      {/* Фильтры и поиск */}
      <div className="filters-bar">
        <div className="filter-tabs">
          <button
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все ({stats.total})
          </button>
          <button
            className={`filter-tab ${filter === 'assigned' ? 'active' : ''}`}
            onClick={() => setFilter('assigned')}
          >
            Привязанные ({stats.assigned})
          </button>
          <button
            className={`filter-tab ${filter === 'unassigned' ? 'active' : ''}`}
            onClick={() => setFilter('unassigned')}
          >
            Не привязанные ({stats.unassigned})
          </button>
        </div>

        <div className="search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Поиск по названию, адресу или ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Таблица автоматов */}
      {loading ? (
        <div className="loading-state">
          <svg className="spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <p>Загрузка автоматов...</p>
        </div>
      ) : filteredMachines.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="2" width="18" height="20" rx="2" />
            <line x1="7" y1="7" x2="17" y2="7" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="7" y1="17" x2="13" y2="17" />
          </svg>
          <h3>Автоматы не найдены</h3>
          <p>
            {searchQuery
              ? 'Попробуйте изменить параметры поиска'
              : machines.length === 0
              ? 'Синхронизируйте автоматы с Vendista'
              : 'Нет автоматов с выбранными фильтрами'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Модель</th>
                <th>Адрес</th>
                <th>Статус</th>
                <th>Бенефициар</th>
                <th>Комиссия</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredMachines.map((machine) => (
                <tr key={machine.id}>
                  <td>
                    <span className="mono-text">{machine.vendista_id}</span>
                  </td>
                  <td>
                    <div className="cell-main">{machine.name || '—'}</div>
                    {machine.serial_number && (
                      <div className="cell-sub">S/N: {machine.serial_number}</div>
                    )}
                  </td>
                  <td>{machine.model || '—'}</td>
                  <td>
                    <div className="cell-address">{machine.address || '—'}</div>
                  </td>
                  <td>
                    <span className={`badge ${machine.is_active ? 'badge-success' : 'badge-secondary'}`}>
                      {machine.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    {machine.assignment ? (
                      <Link
                        href={`/beneficiaries/${machine.assignment.beneficiary_id}`}
                        className="link"
                      >
                        {machine.assignment.beneficiary_id}
                      </Link>
                    ) : (
                      <span className="text-tertiary">Не привязан</span>
                    )}
                  </td>
                  <td>
                    {machine.assignment ? (
                      <span>{machine.assignment.commission_percent}%</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      {machine.assignment && (
                        <Link
                          href={`/beneficiaries/${machine.assignment.beneficiary_id}`}
                          className="btn-sm btn-secondary"
                        >
                          Подробнее
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .page {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          gap: 20px;
        }

        h1 {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }

        .text-secondary {
          color: var(--text-secondary);
          font-size: 14px;
          margin: 0;
        }

        .text-tertiary {
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          background: var(--accent-color);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .alert {
          display: flex;
          gap: 12px;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 24px;
        }

        .alert-warning {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fbbf24;
        }

        .alert strong {
          display: block;
          margin-bottom: 4px;
          font-size: 14px;
        }

        .alert p {
          margin: 0;
          font-size: 13px;
          opacity: 0.9;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
        }

        .stat-label {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .filters-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .filter-tabs {
          display: flex;
          gap: 8px;
          background: var(--bg-secondary);
          padding: 4px;
          border-radius: 10px;
        }

        .filter-tab {
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-tab.active {
          background: white;
          color: var(--accent-color);
          box-shadow: var(--shadow-sm);
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 10px 14px;
          min-width: 300px;
        }

        .search-box input {
          flex: 1;
          border: none;
          background: none;
          outline: none;
          font-size: 14px;
          color: var(--text-primary);
        }

        .search-box input::placeholder {
          color: var(--text-tertiary);
        }

        .loading-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: var(--text-secondary);
        }

        .empty-state svg {
          margin-bottom: 16px;
          opacity: 0.3;
        }

        .empty-state h3 {
          font-size: 18px;
          margin: 0 0 8px 0;
          color: var(--text-primary);
        }

        .empty-state p {
          margin: 0;
          font-size: 14px;
        }

        .table-container {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
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
          padding: 12px 16px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-color);
        }

        .data-table td {
          padding: 16px;
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

        .mono-text {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .cell-main {
          font-weight: 500;
          color: var(--text-primary);
        }

        .cell-sub {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .cell-address {
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .badge-success {
          background: #d1fae5;
          color: #065f46;
        }

        .badge-secondary {
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
        }

        .link {
          color: var(--accent-color);
          text-decoration: none;
          font-weight: 500;
        }

        .link:hover {
          text-decoration: underline;
        }

        .table-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
          border-radius: 6px;
          font-weight: 500;
          text-decoration: none;
          display: inline-block;
          transition: all 0.2s;
        }

        .btn-secondary {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
        }

        @media (max-width: 768px) {
          .page {
            padding: 16px;
          }

          .page-header {
            flex-direction: column;
          }

          .filters-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .search-box {
            min-width: 100%;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .table-container {
            overflow-x: auto;
          }

          .data-table {
            min-width: 800px;
          }
        }
      `}</style>
    </div>
  );
}
