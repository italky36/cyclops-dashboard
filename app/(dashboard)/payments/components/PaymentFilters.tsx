'use client';
import { useState } from 'react';
import type { PaymentFilters as Filters } from '@/types/cyclops';

interface PaymentFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
  isLoading?: boolean;
}


export function PaymentFilters({
  filters,
  onChange,
  onReset,
  isLoading,
}: PaymentFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    const newFilters = { ...filters };
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    onChange(newFilters);
  };

  return (
    <div className="filters-container">
      <div className="presets">
        <button className="preset-btn reset" onClick={onReset} disabled={isLoading}>
          Сбросить все фильтры
        </button>
      </div>

      <div className="quick-filters">
        <div className="filter-group">
          <label className="filter-label">Входящие</label>
          <select
            className="filter-select"
            value={filters.incoming === true ? 'true' : filters.incoming === false ? 'false' : 'all'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'all') {
                updateFilter('incoming', undefined);
                return;
              }
              updateFilter('incoming', val === 'true');
            }}
            disabled={isLoading}
          >
            <option value="all">Все</option>
            <option value="true">Входящие</option>
            <option value="false">Нет</option>
          </select>
        </div>

        <button
          className="expand-btn"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={isLoading}
        >
          {isExpanded ? 'Скрыть фильтры' : 'Больше фильтров'}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {isExpanded && (
        <div className="expanded-filters">
          <div className="filters-grid">
            <div className="filter-group">
              <label className="filter-label">Счёт (20 цифр)</label>
              <input
                type="text"
                className="filter-input"
                placeholder="40702810..."
                maxLength={20}
                value={filters.account || ''}
                onChange={(e) => updateFilter('account', e.target.value || undefined)}
                disabled={isLoading}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">БИК (9 цифр)</label>
              <input
                type="text"
                className="filter-input"
                placeholder="044525..."
                maxLength={9}
                value={filters.bic || ''}
                onChange={(e) => updateFilter('bic', e.target.value || undefined)}
                disabled={isLoading}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Дата создания</label>
              <input
                type="date"
                className="filter-input"
                value={filters.create_date || ''}
                onChange={(e) => updateFilter('create_date', e.target.value || undefined)}
                disabled={isLoading}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Обновлено от</label>
              <input
                type="datetime-local"
                className="filter-input"
                value={filters.updated_at_from?.replace(' ', 'T').slice(0, 16) || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const date = new Date(val);
                    const offset = -date.getTimezoneOffset() / 60;
                    const formatted =
                      val.replace('T', ' ') +
                      ':00' +
                      (offset >= 0 ? '+' : '') +
                      String(offset).padStart(2, '0');
                    updateFilter('updated_at_from', formatted);
                  } else {
                    updateFilter('updated_at_from', undefined);
                  }
                }}
                disabled={isLoading}
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Обновлено до</label>
              <input
                type="datetime-local"
                className="filter-input"
                value={filters.updated_at_to?.replace(' ', 'T').slice(0, 16) || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const date = new Date(val);
                    const offset = -date.getTimezoneOffset() / 60;
                    const formatted =
                      val.replace('T', ' ') +
                      ':00' +
                      (offset >= 0 ? '+' : '') +
                      String(offset).padStart(2, '0');
                    updateFilter('updated_at_to', formatted);
                  } else {
                    updateFilter('updated_at_to', undefined);
                  }
                }}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .filters-container {
          margin-bottom: 24px;
        }

        .presets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }

        .preset-btn {
          padding: 8px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preset-btn:hover:not(:disabled) {
          background: var(--bg-tertiary);
          border-color: var(--text-secondary);
        }

        .preset-btn.reset {
          color: var(--color-error);
        }

        .preset-btn:disabled {
          opacity: 1;
          cursor: not-allowed;
          background: var(--bg-secondary);
          border-color: var(--border-color);
          color: var(--text-secondary);
        }

        .quick-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: flex-end;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 150px;
        }

        .filter-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .filter-select,
        .filter-input {
          padding: 8px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px;
        }

        .filter-select:disabled,
        .filter-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .expand-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 14px;
          cursor: pointer;
          margin-left: auto;
        }

        .expand-btn:hover:not(:disabled) {
          color: var(--text-primary);
        }

        .expanded-filters {
          margin-top: 16px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 12px;
        }

        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        @media (max-width: 767px) {
          .quick-filters {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-group {
            min-width: unset;
          }

          .expand-btn {
            margin-left: 0;
            margin-top: 8px;
          }

          .filters-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
