'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeals } from '@/hooks/useDeals';
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  formatAmount,
  formatDate,
} from '@/lib/utils/deals';
import type { DealStatus, ListDealsParams } from '@/types/cyclops/deals';

// Компонент Badge для статуса
function StatusBadge({ status }: { status: DealStatus }) {
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${DEAL_STATUS_COLORS[status]}`}>
      {DEAL_STATUS_LABELS[status]}
    </span>
  );
}

// Компонент фильтров
function DealsFilters({
  filters,
  onApply,
  onReset,
}: {
  filters: ListDealsParams['filters'];
  onApply: (filters: ListDealsParams['filters']) => void;
  onReset: () => void;
}) {
  const [localFilters, setLocalFilters] = useState(filters || {});

  useEffect(() => {
    setLocalFilters(filters || {});
  }, [filters]);

  const handleApply = () => {
    onApply(localFilters);
  };

  const handleReset = () => {
    setLocalFilters({});
    onReset();
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="filters-grid">
        {/* Статус */}
        <div className="filter-group">
          <label className="filter-label">Статус</label>
          <select
            value={localFilters.status || ''}
            onChange={(e) =>
              setLocalFilters({
                ...localFilters,
                status: (e.target.value as DealStatus) || undefined,
              })
            }
            className="filter-input"
          >
            <option value="">Все</option>
            <option value="new">Новая</option>
            <option value="in_process">В процессе</option>
            <option value="partial">Частично исполнена</option>
            <option value="closed">Завершена</option>
            <option value="rejected">Отменена</option>
            <option value="correction">Требует коррекции</option>
          </select>
        </div>

        {/* Внешний ключ */}
        <div className="filter-group">
          <label className="filter-label">Внешний ключ</label>
          <input
            type="text"
            value={localFilters.ext_key || ''}
            onChange={(e) =>
              setLocalFilters({
                ...localFilters,
                ext_key: e.target.value || undefined,
              })
            }
            placeholder="ext_key"
            className="filter-input"
          />
        </div>

        {/* Дата с */}
        <div className="filter-group">
          <label className="filter-label">Создана с</label>
          <input
            type="date"
            value={localFilters.created_date_from || ''}
            onChange={(e) =>
              setLocalFilters({
                ...localFilters,
                created_date_from: e.target.value || undefined,
              })
            }
            className="filter-input"
          />
        </div>

        {/* Дата по */}
        <div className="filter-group">
          <label className="filter-label">Создана по</label>
          <input
            type="date"
            value={localFilters.created_date_to || ''}
            onChange={(e) =>
              setLocalFilters({
                ...localFilters,
                created_date_to: e.target.value || undefined,
              })
            }
            className="filter-input"
          />
        </div>
      </div>

      <div className="filters-actions">
        <button onClick={handleApply} className="btn btn-primary">
          Применить
        </button>
        <button onClick={handleReset} className="btn btn-ghost">
          Сбросить
        </button>
      </div>

      <style jsx>{`
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filter-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .filter-input {
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
          transition: border-color 0.15s ease;
        }

        .filter-input:focus {
          outline: none;
          border-color: var(--accent-color);
        }

        .filters-actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }

        @media (max-width: 1024px) {
          .filters-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 640px) {
          .filters-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

// Основная страница
export default function DealsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [filters, setFilters] = useState<ListDealsParams['filters']>({});

  const { deals, loading, error, meta, fetchDeals } = useDeals({ autoFetch: false });

  // Загрузка при изменении параметров
  useEffect(() => {
    fetchDeals({ page, per_page: perPage, filters });
  }, [page, perPage, filters, fetchDeals]);

  const handleApplyFilters = (newFilters: ListDealsParams['filters']) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleResetFilters = () => {
    setFilters({});
    setPage(1);
  };

  const handleRowClick = (dealId: string) => {
    router.push(`/deals/${dealId}`);
  };

  return (
    <div className="deals-page">
      {/* Шапка */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Сделки</h1>
          <p className="page-description">Управление выплатами с номинального счёта</p>
        </div>
        <Link href="/deals/create" className="btn btn-primary">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Создать сделку
        </Link>
      </header>

      {/* Фильтры */}
      <DealsFilters filters={filters} onApply={handleApplyFilters} onReset={handleResetFilters} />

      {/* Ошибка */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => fetchDeals({ page, per_page: perPage, filters })} className="error-retry">
            Повторить
          </button>
        </div>
      )}

      {/* Таблица */}
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Внешний ключ</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Создана</th>
                <th>Обновлена</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // Скелетон загрузки
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j}>
                        <div className="skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : deals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    <div className="empty-state-inline">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>Сделки не найдены</span>
                    </div>
                  </td>
                </tr>
              ) : (
                deals.map((deal) => (
                  <tr key={deal.id} onClick={() => handleRowClick(deal.id)} className="clickable-row">
                    <td>
                      <span className="code">{deal.id.slice(0, 8)}...</span>
                    </td>
                    <td>
                      <span className="text-secondary">{deal.ext_key || '—'}</span>
                    </td>
                    <td>
                      <span className="money">{deal.amount !== undefined ? formatAmount(deal.amount) : '—'}</span>
                    </td>
                    <td>{deal.status && <StatusBadge status={deal.status} />}</td>
                    <td>
                      <span className="text-secondary">{deal.created_at ? formatDate(deal.created_at) : '—'}</span>
                    </td>
                    <td>
                      <span className="text-secondary">{deal.updated_at ? formatDate(deal.updated_at) : '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Пагинация */}
      {meta && (
        <div className="pagination">
          <div className="pagination-info">Показано {deals.length} из {meta.total}</div>

          <div className="pagination-controls">
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(1);
              }}
              className="pagination-select"
            >
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>

            <div className="pagination-buttons">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-ghost btn-sm"
              >
                Назад
              </button>
              <span className="pagination-page">Страница {meta.currentPage}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={deals.length < perPage}
                className="btn btn-ghost btn-sm"
              >
                Вперёд
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .deals-page {
          max-width: 1400px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .error-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-color, #dc2626);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .error-retry {
          background: none;
          border: none;
          color: inherit;
          text-decoration: underline;
          cursor: pointer;
          font-size: 14px;
        }

        .skeleton {
          height: 20px;
          background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .clickable-row {
          cursor: pointer;
          transition: background-color 0.15s ease;
        }

        .clickable-row:hover {
          background: var(--bg-hover);
        }

        .text-secondary {
          color: var(--text-secondary);
        }

        .empty-cell {
          padding: 48px !important;
        }

        .empty-state-inline {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          color: var(--text-tertiary);
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 16px;
          padding: 0 4px;
        }

        .pagination-info {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .pagination-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .pagination-select {
          padding: 6px 10px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }

        .pagination-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pagination-page {
          font-size: 14px;
          color: var(--text-secondary);
          padding: 0 8px;
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
            gap: 16px;
          }

          .page-header > a {
            width: 100%;
          }

          .pagination {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .pagination-controls {
            justify-content: space-between;
          }

          /* Преобразуем таблицу в карточки */
          :global(.table thead) {
            display: none;
          }

          :global(.table tbody tr) {
            display: flex;
            flex-direction: column;
            padding: 16px;
            margin-bottom: 8px;
            background: var(--bg-secondary);
            border-radius: 12px;
            gap: 8px;
          }

          :global(.table td) {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
            border-bottom: none;
          }

          :global(.table td::before) {
            content: attr(data-label);
            font-weight: 500;
            color: var(--text-tertiary);
            font-size: 12px;
          }

          .empty-cell {
            justify-content: center !important;
          }

          .empty-cell::before {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
