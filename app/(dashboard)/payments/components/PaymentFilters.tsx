'use client';

import { useState } from 'react';
import type { PaymentFilters as Filters, PaymentStatus, PaymentType } from '@/types/cyclops';

interface PaymentFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onReset: () => void;
  isLoading?: boolean;
}

const STATUS_OPTIONS: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'new', label: 'Новый' },
  { value: 'in_process', label: 'В обработке' },
  { value: 'executed', label: 'Исполнен' },
  { value: 'rejected', label: 'Отклонён' },
  { value: 'returned', label: 'Возвращён' },
];

const TYPE_OPTIONS: Array<{ value: PaymentType; label: string }> = [
  { value: 'incoming', label: 'Входящий' },
  { value: 'incoming_sbp', label: 'Входящий СБП' },
  { value: 'incoming_by_sbp_v2', label: 'Входящий СБП v2' },
  { value: 'payment_contract', label: 'По реквизитам' },
  { value: 'payment_contract_by_sbp_v2', label: 'СБП v2' },
  { value: 'payment_contract_to_card', label: 'На карту' },
  { value: 'commission', label: 'Комиссия' },
  { value: 'ndfl', label: 'НДФЛ' },
  { value: 'refund', label: 'Возврат' },
  { value: 'card', label: 'Карта' },
];

interface FilterPreset {
  label: string;
  filters: Filters;
}

const PRESETS: FilterPreset[] = [
  {
    label: 'Неидентифицированные',
    filters: { incoming: true, identify: false },
  },
  {
    label: 'Все входящие',
    filters: { incoming: true },
  },
];

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

  const applyPreset = (preset: FilterPreset) => {
    onChange(preset.filters);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="filters-container">
      {/* Presets */}
      <div className="presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            className={`preset-btn ${
              JSON.stringify(filters) === JSON.stringify(preset.filters) ? 'active' : ''
            }`}
            onClick={() => applyPreset(preset)}
            disabled={isLoading}
          >
            {preset.label}
          </button>
        ))}
        {hasActiveFilters && (
          <button className="preset-btn reset" onClick={onReset} disabled={isLoading}>
            Сбросить
          </button>
        )}
      </div>

      {/* Quick filters */}
      <div className="quick-filters">
        <div className="filter-group">
          <label className="filter-label">Направление</label>
          <select
            className="filter-select"
            value={filters.incoming === true ? 'true' : filters.incoming === false ? 'false' : ''}
            onChange={(e) => {
              const val = e.target.value;
              updateFilter('incoming', val === '' ? undefined : val === 'true');
              // Reset identify filter if not incoming
              if (val !== 'true') {
                updateFilter('identify', undefined);
              }
            }}
            disabled={isLoading}
          >
            <option value="">Все</option>
            <option value="true">Входящие</option>
            <option value="false">Исходящие</option>
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Идентификация</label>
          <select
            className="filter-select"
            value={filters.identify === false ? 'false' : filters.identify === true ? 'true' : ''}
            onChange={(e) => {
              const val = e.target.value;
              updateFilter('identify', val === '' ? undefined : val === 'true');
            }}
            disabled={isLoading || filters.incoming !== true}
          >
            <option value="">Все</option>
            <option value="false">Неидентифицированные</option>
            <option value="true">Идентифицированные</option>
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

      {/* Expanded filters */}
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
              <label className="filter-label">Статус</label>
              <select
                className="filter-select"
                value={(filters.status as string) || ''}
                onChange={(e) => updateFilter('status', e.target.value as PaymentStatus || undefined)}
                disabled={isLoading}
              >
                <option value="">Все</option>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Тип</label>
              <select
                className="filter-select"
                value={(filters.type as string) || ''}
                onChange={(e) => updateFilter('type', e.target.value as PaymentType || undefined)}
                disabled={isLoading}
              >
                <option value="">Все</option>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
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
                    // Convert to format: YYYY-MM-DD HH:MM:SS+TZ
                    const date = new Date(val);
                    const offset = -date.getTimezoneOffset() / 60;
                    const formatted = val.replace('T', ' ') + ':00' + (offset >= 0 ? '+' : '') + String(offset).padStart(2, '0');
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
                    const formatted = val.replace('T', ' ') + ':00' + (offset >= 0 ? '+' : '') + String(offset).padStart(2, '0');
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

        .preset-btn.active {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: white;
        }

        .preset-btn.reset {
          color: var(--color-error);
        }

        .preset-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
