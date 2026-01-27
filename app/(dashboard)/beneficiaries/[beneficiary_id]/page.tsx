'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useCyclops } from '@/hooks/useCyclops';
import type { BeneficiaryListItem, BeneficiaryDetail } from '@/types/cyclops';

interface Beneficiary {
  beneficiary_id: string;
  type: 'ul' | 'ip' | 'fl';
  inn: string;
  name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  kpp?: string;
  ogrnip?: string;
  birth_date?: string;
  is_active: boolean;
  is_added_to_ms?: boolean | null;
  created_at?: string | null;
}

interface VendingMachine {
  id: number;
  vendista_id: string;
  name: string | null;
  model: string | null;
  address: string | null;
  serial_number: string | null;
  is_active: boolean;
  assignment?: {
    id: number;
    commission_percent: number;
    assigned_at: string;
  };
}

export default function BeneficiaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const beneficiary_id = params.beneficiary_id as string;

  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const { getBeneficiary } = useCyclops({ layer });

  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null);
  const [machines, setMachines] = useState<VendingMachine[]>([]);
  const [availableMachines, setAvailableMachines] = useState<VendingMachine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMachinesLoading, setIsMachinesLoading] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);
  const [commissionPercent, setCommissionPercent] = useState(10);
  const [isAssigning, setIsAssigning] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'machines'>('info');
  const inFlight = useRef(new Set<string>());

  const mapLegalType = (value?: string) => {
    if (value === 'F') return 'fl';
    if (value === 'I') return 'ip';
    if (value === 'J') return 'ul';
    return value as Beneficiary['type'];
  };

  const normalizeBeneficiary = (b: BeneficiaryListItem | BeneficiaryDetail): Beneficiary => ({
    beneficiary_id: b.beneficiary_id || b.id || '',
    type: mapLegalType(b.legal_type) || 'ul',
    inn: b.inn || '',
    name: (b as Record<string, unknown>).name as string | undefined || b.beneficiary_data?.name,
    first_name: (b as Record<string, unknown>).first_name as string | undefined || b.beneficiary_data?.first_name,
    middle_name: (b as Record<string, unknown>).middle_name as string | undefined || b.beneficiary_data?.middle_name,
    last_name: (b as Record<string, unknown>).last_name as string | undefined || b.beneficiary_data?.last_name,
    kpp: (b as Record<string, unknown>).kpp as string | undefined || b.beneficiary_data?.kpp,
    ogrnip: (b as Record<string, unknown>).ogrnip as string | undefined || b.beneficiary_data?.ogrnip,
    birth_date: (b as Record<string, unknown>).birth_date as string | undefined || b.beneficiary_data?.birth_date,
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

  const formatDateSafe = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
  };

  const loadBeneficiary = useCallback(async () => {
    if (inFlight.current.has('beneficiary')) return;
    inFlight.current.add('beneficiary');
    if (!beneficiary_id || beneficiary_id === 'undefined') {
      setIsLoading(false);
      inFlight.current.delete('beneficiary');
      return;
    }
    try {
      const response = await getBeneficiary(beneficiary_id);
      const data = response.result?.beneficiary;
      if (data) {
        setBeneficiary(normalizeBeneficiary(data));
      }
      await fetch('/api/beneficiaries/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh_one',
          layer,
          beneficiary_id,
        }),
      });
    } catch (error) {
      console.error('Failed to load beneficiary:', error);
    } finally {
      setIsLoading(false);
      inFlight.current.delete('beneficiary');
    }
  }, [getBeneficiary, beneficiary_id, layer]);

  const loadMachines = useCallback(async () => {
    if (inFlight.current.has('machines')) return;
    inFlight.current.add('machines');
    if (!beneficiary_id || beneficiary_id === 'undefined') {
      inFlight.current.delete('machines');
      return;
    }
    setIsMachinesLoading(true);
    try {
      const response = await fetch(`/api/assignments?action=by_beneficiary&beneficiary_id=${beneficiary_id}`);
      const data = await response.json();
      if (data.machines) {
        setMachines(data.machines);
      }
    } catch (error) {
      console.error('Failed to load machines:', error);
    } finally {
      setIsMachinesLoading(false);
      inFlight.current.delete('machines');
    }
  }, [beneficiary_id]);

  const loadAvailableMachines = useCallback(async () => {
    if (inFlight.current.has('available_machines')) return;
    inFlight.current.add('available_machines');
    try {
      const response = await fetch('/api/vendista?action=unassigned');
      const data = await response.json();
      if (data.machines) {
        setAvailableMachines(data.machines);
      }
    } catch (error) {
      console.error('Failed to load available machines:', error);
    } finally {
      inFlight.current.delete('available_machines');
    }
  }, []);

  const syncMachines = async () => {
    try {
      const response = await fetch('/api/vendista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_machines' }),
      });
      const data = await response.json();
      if (data.success) {
        await loadAvailableMachines();
        addRecentAction({
          type: 'Синхронизация',
          description: `Синхронизировано ${data.synced_count} автоматов из Vendista`,
          layer,
        });
      }
    } catch (error) {
      console.error('Failed to sync machines:', error);
    }
  };

  const handleAssign = async () => {
    if (!selectedMachineId) return;

    setIsAssigning(true);
    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign',
          machine_id: selectedMachineId,
          beneficiary_id,
          commission_percent: commissionPercent,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowAssignModal(false);
        setSelectedMachineId(null);
        setCommissionPercent(10);
        await loadMachines();
        await loadAvailableMachines();
        addRecentAction({
          type: 'Привязка',
          description: `Автомат привязан к бенефициару ${getBeneficiaryName()}`,
          layer,
        });
      } else {
        alert(data.error || 'Ошибка при привязке автомата');
      }
    } catch (error) {
      console.error('Failed to assign machine:', error);
      alert('Ошибка при привязке автомата');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (assignmentId: number) => {
    if (!confirm('Вы уверены, что хотите отвязать этот автомат?')) return;

    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unassign',
          assignment_id: assignmentId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        await loadMachines();
        await loadAvailableMachines();
        addRecentAction({
          type: 'Отвязка',
          description: `Автомат отвязан от бенефициара ${getBeneficiaryName()}`,
          layer,
        });
      }
    } catch (error) {
      console.error('Failed to unassign machine:', error);
    }
  };

  useEffect(() => {
    loadBeneficiary();
    loadMachines();
    loadAvailableMachines();
  }, [loadBeneficiary, loadMachines, loadAvailableMachines]);

  const getBeneficiaryName = () => {
    if (!beneficiary) return '';
    if (beneficiary.name) return beneficiary.name;
    if (beneficiary.first_name && beneficiary.last_name) {
      return `${beneficiary.last_name} ${beneficiary.first_name}${beneficiary.middle_name ? ' ' + beneficiary.middle_name : ''}`;
    }
    return beneficiary.inn;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ul': return 'Юридическое лицо';
      case 'ip': return 'Индивидуальный предприниматель';
      case 'fl': return 'Физическое лицо';
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <span>Загрузка...</span>
        <style jsx>{`
          .loading-state {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 48px;
            color: var(--text-secondary);
          }
        `}</style>
      </div>
    );
  }

  if (!beneficiary) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Бенефициар не найден</p>
        <Link href="/beneficiaries" className="btn btn-primary" style={{ marginTop: 16 }}>
          К списку бенефициаров
        </Link>
      </div>
    );
  }

  return (
    <div className="beneficiary-detail">
      <header className="page-header">
        <div className="page-header-top">
          <button onClick={() => router.back()} className="btn btn-ghost btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Назад
          </button>
        </div>
        <div className="page-header-main">
          <div>
            <h1 className="page-title">{getBeneficiaryName()}</h1>
            <p className="page-description">
              {getTypeLabel(beneficiary.type)} • ИНН {beneficiary.inn}
            </p>
          </div>
          <div className="header-badges">
            <span className={`status ${beneficiary.is_active ? 'active' : 'inactive'}`}>
              <span className={`status-dot ${beneficiary.is_active ? 'success' : 'neutral'}`} />
              {beneficiary.is_active ? 'Активен' : 'Неактивен'}
            </span>
          </div>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'info' ? 'active' : ''}`}
          onClick={() => setActiveTab('info')}
        >
          Информация
        </button>
        <button
          className={`tab ${activeTab === 'machines' ? 'active' : ''}`}
          onClick={() => setActiveTab('machines')}
        >
          Торговые автоматы
          {machines.length > 0 && <span className="tab-badge">{machines.length}</span>}
        </button>
      </div>

      {activeTab === 'info' && (
        <div className="card">
          <h2 className="card-title">Основная информация</h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">ID в Cyclops</span>
              <span className="info-value code">{beneficiary.beneficiary_id}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Тип</span>
              <span className="info-value">{getTypeLabel(beneficiary.type)}</span>
            </div>
            <div className="info-item">
              <span className="info-label">ИНН</span>
              <span className="info-value code">{beneficiary.inn}</span>
            </div>
            {beneficiary.kpp && (
              <div className="info-item">
                <span className="info-label">КПП</span>
                <span className="info-value code">{beneficiary.kpp}</span>
              </div>
            )}
            {beneficiary.ogrnip && (
              <div className="info-item">
                <span className="info-label">ОГРНИП</span>
                <span className="info-value code">{beneficiary.ogrnip}</span>
              </div>
            )}
            {beneficiary.birth_date && (
              <div className="info-item">
                <span className="info-label">Дата рождения</span>
              <span className="info-value">{formatDateSafe(beneficiary.birth_date)}</span>
            </div>
          )}
          <div className="info-item">
            <span className="info-label">Дата создания</span>
            <span className="info-value">{formatDateSafe(beneficiary.created_at)}</span>
          </div>
            <div className="info-item">
              <span className="info-label">Мастер-система</span>
              <span className="info-value">
                {beneficiary.is_added_to_ms === null ? (
                  <span className="badge badge-neutral">—</span>
                ) : beneficiary.is_added_to_ms ? (
                  <span className="badge badge-success">Добавлен</span>
                ) : (
                  <span className="badge badge-warning">Ожидание</span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'machines' && (
        <div className="machines-section">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Привязанные автоматы</h2>
              <div className="card-actions">
                <button className="btn btn-secondary btn-sm" onClick={syncMachines}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  Синхронизация
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAssignModal(true)}
                  disabled={availableMachines.length === 0}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Привязать
                </button>
              </div>
            </div>

            {isMachinesLoading ? (
              <div className="loading-state">
                <div className="spinner" />
                <span>Загрузка...</span>
              </div>
            ) : machines.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                </div>
                <p className="empty-state-title">Нет привязанных автоматов</p>
                <p className="empty-state-description">
                  Привяжите торговые автоматы для расчёта выплат
                </p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID Vendista</th>
                      <th>Название</th>
                      <th>Адрес</th>
                      <th>Комиссия</th>
                      <th>Привязан</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map((machine) => (
                      <tr key={machine.id}>
                        <td>
                          <span className="code">{machine.vendista_id}</span>
                        </td>
                        <td>{machine.name || '—'}</td>
                        <td className="text-truncate" style={{ maxWidth: 200 }}>
                          {machine.address || '—'}
                        </td>
                        <td>
                          <span className="badge badge-neutral">
                            {machine.assignment?.commission_percent}%
                          </span>
                        </td>
                        <td>
                          {machine.assignment?.assigned_at
                            ? new Date(machine.assignment.assigned_at).toLocaleDateString('ru-RU')
                            : '—'}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => machine.assignment && handleUnassign(machine.assignment.id)}
                            title="Отвязать"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal for assigning machine */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Привязать автомат</h3>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Торговый автомат</label>
                <select
                  className="form-input form-select"
                  value={selectedMachineId || ''}
                  onChange={(e) => setSelectedMachineId(e.target.value ? parseInt(e.target.value, 10) : null)}
                >
                  <option value="">Выберите автомат</option>
                  {availableMachines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.vendista_id} — {machine.name || 'Без названия'}
                      {machine.address ? ` (${machine.address})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Комиссия (%)</label>
                <input
                  type="number"
                  className="form-input"
                  value={commissionPercent}
                  onChange={(e) => setCommissionPercent(parseFloat(e.target.value) || 0)}
                  min="0"
                  max="100"
                  step="0.1"
                />
                <span className="form-hint">
                  Процент комиссии, удерживаемый с выручки автомата
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>
                Отмена
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAssign}
                disabled={!selectedMachineId || isAssigning}
              >
                {isAssigning ? (
                  <>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                    Привязка...
                  </>
                ) : (
                  'Привязать'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .beneficiary-detail {
          max-width: 1200px;
        }

        .page-header-top {
          margin-bottom: 16px;
        }

        .page-header-main {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .header-badges {
          display: flex;
          gap: 8px;
        }

        .tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          margin-left: 8px;
          font-size: 11px;
          font-weight: 600;
          background: var(--accent-color);
          color: white;
          border-radius: 10px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 24px;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .info-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-size: 15px;
          color: var(--text-primary);
        }

        .machines-section {
          margin-top: 0;
        }

        .card-actions {
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

        @media (max-width: 767px) {
          .page-header-main {
            flex-direction: column;
          }

          .card-header {
            flex-direction: column;
            align-items: stretch;
          }

          .card-actions {
            margin-top: 12px;
          }

          .card-actions .btn {
            flex: 1;
          }

          .info-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
        }
      `}</style>
    </div>
  );
}
