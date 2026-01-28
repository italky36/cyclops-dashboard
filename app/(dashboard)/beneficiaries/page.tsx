'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import { getStatusCheckWindow } from '@/lib/beneficiary-status';
import { getLastStatusCheck, setLastStatusCheck } from '@/lib/beneficiary-status-storage';
import type { BeneficiaryListItem } from '@/types/cyclops';

interface Beneficiary {
  beneficiary_id: string;
  type: 'ul' | 'ip' | 'fl';
  inn: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  kpp?: string;
  ogrnip?: string;
  is_active: boolean;
  is_added_to_ms?: boolean | null;
  created_at?: string | null;
}

const mapLegalType = (value?: string) => {
  if (value === 'F') return 'fl';
  if (value === 'I') return 'ip';
  if (value === 'J') return 'ul';
  return value as Beneficiary['type'];
};

const normalizeBeneficiary = (b: BeneficiaryListItem): Beneficiary => ({
  beneficiary_id: b.beneficiary_id || b.id || '',
  type: mapLegalType(b.legal_type) || 'ul',
  inn: b.inn || '',
  name: (b as Record<string, unknown>).name as string | undefined || b.beneficiary_data?.name,
  first_name: (b as Record<string, unknown>).first_name as string | undefined || b.beneficiary_data?.first_name,
  middle_name: (b as Record<string, unknown>).middle_name as string | undefined || b.beneficiary_data?.middle_name,
  last_name: (b as Record<string, unknown>).last_name as string | undefined || b.beneficiary_data?.last_name,
  kpp: (b as Record<string, unknown>).kpp as string | undefined || b.beneficiary_data?.kpp,
  ogrnip: (b as Record<string, unknown>).ogrnip as string | undefined || b.beneficiary_data?.ogrnip,
  is_active: b.is_active ?? true,
  is_added_to_ms: typeof b.is_added_to_ms === 'boolean'
    ? b.is_added_to_ms
    : typeof b.is_added_to_ms === 'number'
      ? b.is_added_to_ms === 1
      : typeof b.is_added_to_ms === 'string'
        ? b.is_added_to_ms === '1' || (b.is_added_to_ms as string).toLowerCase() === 'true'
        : null,
  created_at: b.created_at || b.updated_at || null,
});

export default function BeneficiariesPage() {
  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const cyclops = useCyclops({ layer });
  
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const formatDateSafe = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
  };

  const formatTime = (value: number) =>
    new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const loadBeneficiaries = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      if (forceRefresh) {
        setIsRefreshing(true);
        await fetch('/api/beneficiaries/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'refresh_list',
            layer,
            filters: filter === 'all' ? {} : { is_active: filter === 'active' },
          }),
        });
      }

      const response = await fetch('/api/beneficiaries/cache');
      const data = await response.json();
      const list = data?.beneficiaries;
      if (Array.isArray(list)) {
        let mapped = list.map(normalizeBeneficiary).filter((b) => b.beneficiary_id);
        if (filter !== 'all') {
          const activeFilter = filter === 'active';
          mapped = mapped.filter((b) => b.is_active === activeFilter);
        }
        setBeneficiaries(mapped);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(message);
      console.error('Failed to load beneficiaries:', err);
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [filter, layer]);

  useEffect(() => {
    loadBeneficiaries(true);
  }, [loadBeneficiaries]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setCreatedId(params.get('created_id'));
  }, []);

  const handleToggleActive = async (beneficiary: Beneficiary) => {
    try {
      if (beneficiary.is_active) {
        await cyclops.deactivateBeneficiary(beneficiary.beneficiary_id);
        addRecentAction({
          type: 'Деактивация',
          description: `Бенефициар ${getBeneficiaryName(beneficiary)} деактивирован`,
          layer,
        });
      } else {
        await cyclops.activateBeneficiary(beneficiary.beneficiary_id);
        addRecentAction({
          type: 'Активация',
          description: `Бенефициар ${getBeneficiaryName(beneficiary)} активирован`,
          layer,
        });
      }
      await loadBeneficiaries();
    } catch (error) {
      console.error('Failed to toggle beneficiary:', error);
    }
  };

  const handleRefreshStatus = async (beneficiaryId: string) => {
    try {
      const lastCheckedAt = getLastStatusCheck(beneficiaryId);
      const window = getStatusCheckWindow(lastCheckedAt);
      if (!window.allowed) {
        const remainingMinutes = Math.ceil(window.remainingMs / 60000);
        setStatusHint(
          `Следующая проверка статуса будет доступна в ${formatTime(window.nextAvailableAt)} (через ${remainingMinutes} мин.)`
        );
        return;
      }

      setLastStatusCheck(beneficiaryId);
      setStatusHint(null);
      setIsRefreshing(true);
      const response = await fetch('/api/beneficiaries/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh_one',
          layer,
          beneficiary_id: beneficiaryId,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Ошибка проверки статуса');
      }
      if (data?.skipped) {
        setLastStatusCheck(beneficiaryId);
        if (data.next_available_at) {
          const nextAvailableAt = Date.parse(data.next_available_at);
          if (!Number.isNaN(nextAvailableAt)) {
            const remainingMinutes = Math.ceil((nextAvailableAt - Date.now()) / 60000);
            setStatusHint(
              `Следующая проверка статуса будет доступна в ${formatTime(nextAvailableAt)} (через ${remainingMinutes} мин.)`
            );
            return;
          }
        }
        setStatusHint('Проверка статуса доступна раз в 5 минут для каждого бенефициара.');
        return;
      }
      await loadBeneficiaries();
    } catch (error) {
      console.error('Failed to refresh beneficiary:', error);
      setStatusHint('Не удалось проверить статус. Попробуйте позже.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getBeneficiaryName = (b: Beneficiary) => {
    if (b.name) return b.name;
    if (b.first_name && b.last_name) return `${b.last_name} ${b.first_name}`;
    return b.inn;
  };

  const getBeneficiaryTypeLabel = (type: string) => {
    switch (type) {
      case 'ul': return 'ЮЛ';
      case 'ip': return 'ИП';
      case 'fl': return 'ФЛ';
      default: return type;
    }
  };

  const filteredBeneficiaries = beneficiaries.filter((b) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      b.inn.includes(search) ||
      getBeneficiaryName(b).toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="beneficiaries-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Бенефициары</h1>
          <p className="page-description">
            Управление бенефициарами номинального счёта
          </p>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => loadBeneficiaries(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Обновление...' : 'Обновить список'}
          </button>
          <Link href="/beneficiaries/new" className="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Добавить
          </Link>
        </div>
      </header>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-wrapper">
          <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="form-input search-input"
            placeholder="Поиск по ИНН или названию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="tabs">
          <button
            className={`tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button
            className={`tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Активные
          </button>
          <button
            className={`tab ${filter === 'inactive' ? 'active' : ''}`}
            onClick={() => setFilter('inactive')}
          >
            Неактивные
          </button>
        </div>
      </div>

      {createdId && (
        <div className="form-hint" style={{ marginBottom: 12 }}>
          Создано в Cyclops
          {createdId ? (
            <>
              {' '}ID: <span className="code">{createdId}</span>.
            </>
          ) : null}
          {' '}Ожидаем регистрацию в мастер-системе.
        </div>
      )}

      {statusHint && (
        <div className="form-hint" style={{ marginBottom: 12 }}>
          {statusHint}
        </div>
      )}

      {/* List */}
      <div className="card">
        {isLoading ? (
          <div className="loading-state">
            <div className="spinner" />
            <span>Загрузка...</span>
          </div>
        ) : error ? (
          <div className="error-state">
            <div className="error-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p className="error-state-title">Ошибка загрузки</p>
            <p className="error-state-description">{error}</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => loadBeneficiaries()}
            >
              Повторить
            </button>
          </div>
        ) : filteredBeneficiaries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="empty-state-title">Нет бенефициаров</p>
            <p className="empty-state-description">
              Добавьте первого бенефициара для начала работы
            </p>
            <Link href="/beneficiaries/new" className="btn btn-primary" style={{ marginTop: 16 }}>
              Добавить бенефициара
            </Link>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Название / ФИО</th>
                  <th>ИНН</th>
                  <th>Статус</th>
                  <th>Мастер-система</th>
                  <th>Создан</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredBeneficiaries.map((b) => (
                  <tr key={b.beneficiary_id}>
                    <td>
                      <span className="badge badge-neutral">
                        {getBeneficiaryTypeLabel(b.type)}
                      </span>
                    </td>
                    <td>
                      <Link 
                        href={`/beneficiaries/${b.beneficiary_id}`}
                        className="beneficiary-name"
                      >
                        {getBeneficiaryName(b)}
                      </Link>
                    </td>
                    <td>
                      <span className="code">{b.inn}</span>
                    </td>
                    <td>
                      <span className={`status ${b.is_active ? 'active' : 'inactive'}`}>
                        <span className={`status-dot ${b.is_active ? 'success' : 'neutral'}`} />
                        {b.is_active ? 'Активен' : 'Неактивен'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {b.is_added_to_ms === null ? (
                          <span className="badge badge-neutral">—</span>
                        ) : b.is_added_to_ms ? (
                          <span className="badge badge-success">Добавлен</span>
                        ) : (
                          <span className="badge badge-warning">Ожидание</span>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRefreshStatus(b.beneficiary_id)}
                          title="Проверить статус"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10" />
                            <path d="M1 14l4.64 4.36A9 9 0 0020.49 15" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td>
                      {formatDateSafe(b.created_at)}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleToggleActive(b)}
                          title={b.is_active ? 'Деактивировать' : 'Активировать'}
                        >
                          {b.is_active ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 11 12 14 22 4" />
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                          )}
                        </button>
                        <Link 
                          href={`/beneficiaries/${b.beneficiary_id}`}
                          className="btn btn-ghost btn-sm"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .beneficiaries-page {
          max-width: 1400px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .filters-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 24px;
        }

        .search-wrapper {
          position: relative;
          flex: 1;
          max-width: 400px;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-tertiary);
          pointer-events: none;
        }

        .search-input {
          padding-left: 42px;
        }

        .loading-state {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 48px;
          color: var(--text-secondary);
        }

        .error-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          text-align: center;
        }

        .error-state-icon {
          color: var(--error-color, #ef4444);
          margin-bottom: 16px;
        }

        .error-state-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .error-state-description {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0;
          max-width: 500px;
          white-space: pre-line;
          line-height: 1.6;
        }

        .beneficiary-name {
          color: var(--text-primary);
          text-decoration: none;
          font-weight: 500;
        }

        .beneficiary-name:hover {
          color: var(--accent-color);
        }

        .actions {
          display: flex;
          gap: 4px;
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: stretch;
          }

          .header-actions {
            flex-direction: column;
          }

          .header-actions .btn {
            width: 100%;
          }

          .filters-bar {
            flex-direction: column;
            gap: 12px;
            align-items: stretch;
          }

          .search-wrapper {
            max-width: none;
          }

          /* Преобразуем таблицу в карточки на мобильных */
          .table-wrapper {
            margin: 0 -16px;
            padding: 0 16px;
          }

          :global(.table) {
            min-width: unset !important;
          }

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
            font-size: 14px;
          }

          :global(.table td::before) {
            content: attr(data-label);
            font-size: 12px;
            font-weight: 500;
            color: var(--text-tertiary);
            text-transform: uppercase;
          }

          .actions {
            justify-content: flex-end;
            padding-top: 8px;
            border-top: 1px solid var(--border-color);
            margin-top: 8px;
          }
        }
      `}</style>
    </div>
  );
}
