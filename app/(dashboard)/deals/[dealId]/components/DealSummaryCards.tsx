'use client';

import type { Deal, ComplianceCheckDealResult } from '@/types/cyclops/deals';
import type { DocumentListItem } from '@/types/cyclops';
import { formatDate } from '@/lib/utils/deals';

interface MetricCardProps {
  icon: string;
  label: string;
  value: string | number;
  detail?: string;
  status?: 'default' | 'success' | 'warning' | 'error';
  clickable?: boolean;
  onClick?: () => void;
}

function MetricCard({ icon, label, value, detail, status = 'default', clickable, onClick }: MetricCardProps) {
  const Component = clickable ? 'button' : 'div';

  return (
    <Component
      className={`metric-card ${status} ${clickable ? 'clickable' : ''}`}
      onClick={onClick}
      type={clickable ? 'button' : undefined}
    >
      <div className="metric-icon">{icon}</div>
      <div className="metric-content">
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
        {detail && <div className="metric-detail">{detail}</div>}
      </div>

      <style jsx>{`
        .metric-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          transition: all 0.2s ease;
        }

        .metric-card.clickable {
          cursor: pointer;
          border: none;
          width: 100%;
          text-align: left;
        }

        .metric-card.clickable:hover {
          background: var(--bg-tertiary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .metric-icon {
          font-size: 24px;
          line-height: 1;
          flex-shrink: 0;
        }

        .metric-content {
          flex: 1;
          min-width: 0;
        }

        .metric-label {
          font-size: 12px;
          color: var(--text-tertiary);
          margin-bottom: 4px;
          font-weight: 500;
        }

        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .metric-detail {
          font-size: 11px;
          color: var(--text-secondary);
          margin-top: 4px;
        }

        .metric-card.success .metric-value {
          color: var(--color-success);
        }

        .metric-card.warning .metric-value {
          color: var(--color-warning);
        }

        .metric-card.error .metric-value {
          color: var(--color-error);
        }
      `}</style>
    </Component>
  );
}

interface DealSummaryCardsProps {
  deal: Deal;
  documents: DocumentListItem[];
  complianceResult?: ComplianceCheckDealResult | null;
  onComplianceClick?: () => void;
}

export function DealSummaryCards({ deal, documents, complianceResult, onComplianceClick }: DealSummaryCardsProps) {
  const recipientsSuccess = deal.recipients.filter((r) => r.status === 'success').length;
  const recipientsRejected = deal.recipients.filter((r) => r.status === 'reject').length;
  const recipientsInProcess = deal.recipients.filter((r) => r.status === 'in_process').length;

  let recipientsStatus: 'default' | 'success' | 'warning' | 'error' = 'default';
  let recipientsDetail = '';

  if (recipientsSuccess === deal.recipients.length) {
    recipientsStatus = 'success';
    recipientsDetail = 'Все успешно';
  } else if (recipientsRejected > 0) {
    recipientsStatus = 'error';
    recipientsDetail = `${recipientsRejected} отклонено`;
  } else if (recipientsInProcess > 0) {
    recipientsStatus = 'warning';
    recipientsDetail = `${recipientsInProcess} в процессе`;
  }

  const compliancePayments = complianceResult?.compliance_check_payments || [];
  const complianceRejected = compliancePayments.filter((p) => !p.approved).length;

  let complianceStatus: 'default' | 'success' | 'warning' | 'error' = 'default';
  let complianceValue = '—';
  let complianceDetail = 'Нажмите для проверки';

  if (compliancePayments.length > 0) {
    if (complianceRejected === 0) {
      complianceStatus = 'success';
      complianceValue = '✓';
      complianceDetail = 'Все платежи одобрены';
    } else {
      complianceStatus = 'error';
      complianceValue = '✗';
      complianceDetail = `${complianceRejected} отклонено`;
    }
  }

  return (
    <>
      <div className="summary-cards-grid">
        <MetricCard icon="👥" label="Получателей" value={deal.recipients.length} detail={recipientsDetail} status={recipientsStatus} />

        <MetricCard icon="💰" label="Плательщиков" value={deal.payers.length} />

        <MetricCard icon="📄" label="Документов" value={documents.length} detail={documents.length > 0 ? 'Загружено' : 'Нет документов'} />

        <MetricCard
          icon="🛡️"
          label="Комплаенс"
          value={complianceValue}
          detail={complianceDetail}
          status={complianceStatus}
          clickable={!!onComplianceClick}
          onClick={onComplianceClick}
        />

        <MetricCard
          icon="📅"
          label="Создана"
          value={formatDate(deal.created_at).split(', ')[0]}
          detail={formatDate(deal.created_at).split(', ')[1]}
        />

        <MetricCard
          icon="🔄"
          label="Обновлена"
          value={formatDate(deal.updated_at).split(', ')[0]}
          detail={formatDate(deal.updated_at).split(', ')[1]}
        />
      </div>

      <style jsx>{`
        .summary-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        @media (max-width: 767px) {
          .summary-cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 480px) {
          .summary-cards-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
