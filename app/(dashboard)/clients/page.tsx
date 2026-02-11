'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';

interface ClientListItem {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  inn: string | null;
  payout_type: string;
  is_active: boolean;
  machine_count: number;
  beneficiary_id: string | null;
  created_at: string;
}

const PAYOUT_TYPE_LABELS: Record<string, string> = {
  payment_contract: 'Банк. перевод',
  payment_contract_by_sbp_v2: 'СБП',
  payment_contract_to_card: 'Карта',
};

export default function ClientsPage() {
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('is_active', filter === 'active' ? 'true' : 'false');
      }
      if (search) {
        params.set('search', search);
      }
      const res = await fetch(`/api/clients?${params}`);
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      setClients(data.clients || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIsLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить клиента "${name}"?`)) return;
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Ошибка удаления');
      }
      addRecentAction(`Удалён клиент: ${name}`);
      loadClients();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Клиенты</h1>
          <p className="page-description">Управление клиентами и их реквизитами для выплат</p>
        </div>
        <Link href="/clients/create" className="btn btn-primary">
          + Добавить клиента
        </Link>
      </div>

      <div className="filters-row">
        <div className="search-box">
          <input
            type="text"
            placeholder="Поиск по имени, ИНН..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input"
          />
        </div>
        <div className="filter-tabs">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Неактивные'}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="loading">Загрузка...</div>}
      {error && <div className="error-message">{error}</div>}

      {!isLoading && !error && clients.length === 0 && (
        <div className="empty-state">
          <p>Клиенты не найдены</p>
          <Link href="/clients/create" className="btn btn-primary">
            Создать первого клиента
          </Link>
        </div>
      )}

      {!isLoading && clients.length > 0 && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>ИНН</th>
                <th>Тип выплаты</th>
                <th>Автоматы</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <Link href={`/clients/${client.id}`} className="link">
                      {client.name}
                    </Link>
                    {client.contact_name && (
                      <div className="text-secondary text-sm">{client.contact_name}</div>
                    )}
                  </td>
                  <td className="mono">{client.inn || '—'}</td>
                  <td>
                    <span className="badge badge-info">
                      {PAYOUT_TYPE_LABELS[client.payout_type] || client.payout_type}
                    </span>
                  </td>
                  <td>{client.machine_count}</td>
                  <td>
                    <span className={`badge ${client.is_active ? 'badge-success' : 'badge-muted'}`}>
                      {client.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <Link href={`/clients/${client.id}`} className="btn btn-sm btn-secondary">
                        Детали
                      </Link>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(client.id, client.name)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .page-container {
          padding: 24px;
          max-width: 1200px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          gap: 16px;
        }
        .page-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }
        .page-description {
          color: var(--text-secondary);
          font-size: 14px;
          margin: 4px 0 0;
        }
        .filters-row {
          display: flex;
          gap: 16px;
          margin-bottom: 20px;
          align-items: center;
          flex-wrap: wrap;
        }
        .search-box {
          flex: 1;
          min-width: 200px;
        }
        .input {
          width: 100%;
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
        .filter-tabs {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 4px;
        }
        .filter-tab {
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 6px;
          font-size: 13px;
          transition: all 0.15s ease;
        }
        .filter-tab.active {
          background: var(--bg-primary);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
        .loading {
          text-align: center;
          padding: 48px;
          color: var(--text-secondary);
        }
        .error-message {
          padding: 16px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #dc2626);
          border-radius: 8px;
          font-size: 14px;
        }
        .empty-state {
          text-align: center;
          padding: 64px 24px;
          color: var(--text-secondary);
        }
        .empty-state p {
          margin-bottom: 16px;
        }
        .table-container {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          overflow: hidden;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
        }
        .data-table td {
          padding: 14px 16px;
          font-size: 14px;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border-color);
        }
        .data-table tr:last-child td {
          border-bottom: none;
        }
        .data-table tr:hover td {
          background: var(--bg-hover);
        }
        .link {
          color: var(--accent-color);
          text-decoration: none;
          font-weight: 500;
        }
        .link:hover {
          text-decoration: underline;
        }
        .text-secondary {
          color: var(--text-secondary);
        }
        .text-sm {
          font-size: 12px;
        }
        .mono {
          font-family: var(--font-mono);
          font-size: 13px;
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .badge-success {
          background: #dcfce7;
          color: #166534;
        }
        .badge-muted {
          background: var(--bg-secondary);
          color: var(--text-secondary);
        }
        .badge-info {
          background: #dbeafe;
          color: #1e40af;
        }
        .action-buttons {
          display: flex;
          gap: 8px;
        }
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
        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
        }
        .btn-primary {
          background: var(--accent-color, #6366f1);
          color: white;
        }
        .btn-primary:hover {
          opacity: 0.9;
        }
        .btn-secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
        .btn-secondary:hover {
          background: var(--bg-tertiary);
        }
        .btn-danger {
          background: transparent;
          color: var(--error-color, #dc2626);
        }
        .btn-danger:hover {
          background: var(--error-bg, #fef2f2);
        }
        @media (max-width: 767px) {
          .page-container {
            padding: 16px;
          }
          .page-header {
            flex-direction: column;
          }
          .data-table th:nth-child(n+3),
          .data-table td:nth-child(n+3) {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
