'use client';

import { useRouter } from 'next/navigation';
import type { Deal } from '@/types/cyclops/deals';
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS, formatAmount } from '@/lib/utils/deals';
import { CopyButton } from '@/components/ui/CopyButton';

interface DealHeaderProps {
  deal: Deal;
  onBack?: () => void;
  onExecute?: () => void;
  onReject?: () => void;
  onCancelFromCorrection?: () => void;
  onCheckCompliance?: () => void;
  onOpenComplianceModal?: () => void;
  onEdit?: () => void;
  onRefresh?: () => void;
  autoRefresh?: boolean;
  onAutoRefreshChange?: (value: boolean) => void;
  loading?: boolean;
  actions: {
    canExecute: boolean;
    canEdit: boolean;
    canReject: boolean;
    canCancelFromCorrection: boolean;
  };
}

export function DealHeader({
  deal,
  onBack,
  onExecute,
  onReject,
  onCancelFromCorrection,
  onCheckCompliance,
  onOpenComplianceModal,
  onEdit,
  onRefresh,
  autoRefresh = false,
  onAutoRefreshChange,
  loading = false,
  actions,
}: DealHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/deals');
    }
  };

  return (
    <>
      <div className="deal-header-sticky">
        <div className="deal-header-container">
          <div className="deal-header-left">
            <button onClick={handleBack} className="btn-back" title="Назад к списку">
              ←
            </button>
            <div className="deal-info-compact">
              <div className="deal-id-group">
                <span className="deal-id-label">Сделка</span>
                <span className="deal-id-value">{deal.id}</span>
                <CopyButton text={deal.id} />
              </div>
              <button
                type="button"
                className={`badge-status ${DEAL_STATUS_COLORS[deal.status]}`}
                onClick={onOpenComplianceModal}
                title="Показать детали комплаенс"
              >
                {DEAL_STATUS_LABELS[deal.status]}
              </button>
              {(onRefresh || onAutoRefreshChange) && (
                <div className="refresh-group">
                  {onRefresh && (
                    <button
                      onClick={onRefresh}
                      className="btn btn-ghost btn-sm btn-icon"
                      title="Обновить"
                      disabled={loading}
                      aria-label="Обновить"
                    >
                      ↻
                    </button>
                  )}
                  {onAutoRefreshChange && (
                    <label className="auto-refresh" title="Автообновление">
                      <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={(event) => onAutoRefreshChange(event.target.checked)}
                      />
                      <span>Авто</span>
                    </label>
                  )}
                </div>
              )}
              <div className="deal-amount-compact">
                {formatAmount(deal.amount)}
              </div>
            </div>
          </div>

          <div className="deal-header-actions">
            {actions.canExecute && (
              <button onClick={onExecute} className="btn btn-primary btn-sm" disabled={loading}>
                {deal.status === 'partial' ? 'Исполнить' : 'Исполнить'}
              </button>
            )}

            {actions.canEdit && (
              <button onClick={onEdit} className="btn btn-secondary btn-sm" disabled={loading}>
                Редактировать
              </button>
            )}

            {actions.canReject && (
              <button onClick={onReject} className="btn btn-danger btn-sm" disabled={loading}>
                Отменить
              </button>
            )}

            {actions.canCancelFromCorrection && (
              <button onClick={onCancelFromCorrection} className="btn btn-secondary btn-sm" disabled={loading}>
                Отменить из коррекции
              </button>
            )}

            {(actions.canExecute || actions.canEdit) && (
              <button onClick={onCheckCompliance} className="btn btn-ghost btn-sm" disabled={loading}>
                Комплаенс
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .deal-header-sticky {
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          margin: -20px -20px 20px -20px;
          padding: 12px 20px;
          transition: box-shadow 0.2s ease;
        }

        .deal-header-sticky:has(+ *) {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .deal-header-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .deal-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .btn-back {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .btn-back:hover {
          background: var(--bg-tertiary);
          border-color: var(--text-tertiary);
          color: var(--text-primary);
        }

        .deal-info-compact {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .deal-id-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .deal-id-label {
          font-size: 12px;
          color: var(--text-tertiary);
          font-weight: 500;
        }

        .deal-id-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'Courier New', monospace;
        }

        .badge-status {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: opacity 0.2s ease;
          white-space: nowrap;
        }

        .badge-status:hover {
          opacity: 0.8;
        }

        .deal-amount-compact {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin-left: auto;
        }

        .deal-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .btn {
          white-space: nowrap;
        }

        .refresh-group {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-icon {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
        }

        .auto-refresh {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
          user-select: none;
        }

        .auto-refresh input {
          accent-color: var(--accent-color);
        }

        @media (max-width: 900px) {
          .deal-header-container {
            flex-direction: column;
            align-items: stretch;
          }

          .deal-header-left {
            flex-wrap: wrap;
          }

          .deal-amount-compact {
            margin-left: 0;
          }

          .deal-header-actions {
            justify-content: flex-start;
            flex-wrap: wrap;
          }

          .deal-header-actions .btn {
            flex: 1;
            min-width: fit-content;
          }

          .refresh-group {
            width: 100%;
          }
        }

        @media (max-width: 600px) {
          .deal-id-value {
            font-size: 11px;
            word-break: break-all;
          }

          .deal-header-actions {
            flex-direction: column;
          }

          .deal-header-actions .btn {
            width: 100%;
          }

          .refresh-group {
            justify-content: space-between;
          }
        }
      `}</style>
    </>
  );
}
