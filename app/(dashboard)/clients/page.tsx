'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { buildClientPath } from '@/lib/client-slug';

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
  payment_contract_by_sbp: 'СБП',
  payment_contract_by_sbp_v2: 'СБП (v2)',
  payment_contract_to_card: 'Карта',
  none: 'Без шаблона',
};

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');

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
        <div className="view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Таблица"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button
            className={`toggle-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Карточки"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
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

      {!isLoading && clients.length > 0 && viewMode === 'table' && (
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
                    <Link href={buildClientPath(client.id, client.name)} className="link">
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
                    <Link href={buildClientPath(client.id, client.name)} className="btn btn-sm btn-secondary">
                      Детали
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && clients.length > 0 && viewMode === 'cards' && (
        <div className="cards-grid">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={buildClientPath(client.id, client.name)}
              className="client-card"
            >
              <div className="client-card-header">
                <div className="client-card-name">
                  <span className="client-card-title">{client.name}</span>
                  {client.contact_name && (
                    <div className="client-card-contact">{client.contact_name}</div>
                  )}
                </div>
                <div className="client-card-badges">
                  <span className={`badge ${client.is_active ? 'badge-success' : 'badge-muted'}`}>
                    {client.is_active ? 'Активен' : 'Неактивен'}
                  </span>
                  <span className="badge badge-info">
                    {PAYOUT_TYPE_LABELS[client.payout_type] || client.payout_type}
                  </span>
                </div>
              </div>
              <div className="client-card-metrics">
                <div className="client-metric" title="Автоматы">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
                    <polyline points="17 2 12 7 7 2"/>
                  </svg>
                  <span>{client.machine_count}</span>
                </div>
                <div className="client-metric" title={client.inn ? `ИНН: ${client.inn}` : 'ИНН не указан'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <span>{client.inn || '—'}</span>
                </div>
              </div>
            </Link>
          ))}
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
        .view-toggle {
          display: flex;
          gap: 2px;
          background: var(--bg-secondary);
          border-radius: 8px;
          padding: 3px;
        }
        .toggle-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--text-tertiary);
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.15s ease;
        }
        .toggle-btn.active {
          background: var(--bg-primary);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }
        .toggle-btn:hover:not(.active) {
          color: var(--text-secondary);
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
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .client-card {
          background: var(--bg-primary);
          border: 1.5px solid var(--border-color);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: var(--shadow-sm);
          transition: box-shadow 0.15s ease, border-color 0.15s ease;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }
        .client-card:hover {
          box-shadow: var(--shadow-md);
          border-color: var(--accent-color);
        }
        .client-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .client-card-name {
          flex: 1;
          min-width: 0;
        }
        .client-card-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .client-card-contact {
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 2px;
        }
        .client-card-badges {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .client-card-metrics {
          display: flex;
          gap: 16px;
          padding: 8px 0;
          border-top: 1px solid var(--border-color);
        }
        .client-metric {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }
        @media (max-width: 767px) {
          .page-container {
            padding: 16px;
          }
          .page-header {
            flex-direction: column;
          }
          .cards-grid {
            grid-template-columns: 1fr;
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
