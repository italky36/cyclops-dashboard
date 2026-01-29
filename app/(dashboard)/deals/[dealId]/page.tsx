'use client';

import { useMemo, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeal } from '@/hooks/useDeals';
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  RECIPIENT_TYPE_LABELS,
  formatAmount,
  formatDate,
  getAvailableActions,
} from '@/lib/utils/deals';
import type { ComplianceCheckPayment, DealDocument, DealRecipientInfo } from '@/types/cyclops/deals';

const RECIPIENT_STATUS_COLORS: Record<string, string> = {
  new: 'bg-gray-100 text-gray-800',
  in_process: 'bg-blue-100 text-blue-800',
  reject: 'bg-red-100 text-red-800',
  success: 'bg-green-100 text-green-800',
  old: 'bg-gray-100 text-gray-500',
};

const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_process: 'В процессе',
  reject: 'Отклонён',
  success: 'Успешно',
  old: 'Устаревший',
};

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

const formatRequisiteValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const maskCardNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `**** **** **** ${digits.slice(-4)}`;
  }
  return 'Скрыто';
};

function RecipientRequisites({ recipient }: { recipient: DealRecipientInfo }) {
  const requisites = (recipient.requisites || {}) as Record<string, unknown>;
  const preferredKeys: string[] = (() => {
    switch (recipient.type) {
      case 'payment_contract':
        return ['account', 'bank_code', 'inn', 'kpp', 'name', 'purpose'];
      case 'payment_contract_by_sbp':
      case 'payment_contract_by_sbp_v2':
        return ['last_name', 'first_name', 'middle_name', 'phone_number', 'bank_sbp_id', 'purpose'];
      case 'payment_contract_to_card':
        return ['card_number', 'card_number_crypto_base64', 'last_name', 'first_name', 'middle_name', 'purpose'];
      case 'commission':
        return ['name', 'inn', 'kpp', 'purpose'];
      case 'ndfl':
        return ['account', 'bank_code', 'inn', 'kpp', 'purpose', 'kbk', 'oktmo', 'base'];
      case 'ndfl_to_virtual_account':
        return ['virtual_account'];
      default:
        return [];
    }
  })();

  const labels: Record<string, string> = {
    account: 'Счёт',
    bank_code: 'БИК',
    name: 'Наименование',
    inn: 'ИНН',
    kpp: 'КПП',
    purpose: 'Назначение',
    first_name: 'Имя',
    last_name: 'Фамилия',
    middle_name: 'Отчество',
    phone_number: 'Телефон',
    bank_sbp_id: 'Банк СБП',
    virtual_account: 'Виртуальный счёт',
    card_number: 'Номер карты',
    card_number_crypto_base64: 'Номер карты',
    kbk: 'КБК',
    oktmo: 'ОКТМО',
    base: 'Основание',
  };

  const keys = Object.keys(requisites);
  const orderedKeys = [...preferredKeys, ...keys.filter((key) => !preferredKeys.includes(key))];
  const rows = orderedKeys
    .filter((key) => key in requisites)
    .map((key) => {
      const rawValue = requisites[key];
      const isCard = key.toLowerCase().includes('card');
      const value =
        typeof rawValue === 'string' && isCard ? maskCardNumber(rawValue) : formatRequisiteValue(rawValue);
      return {
        key,
        label: labels[key] || key,
        value,
      };
    });

  if (rows.length === 0) {
    return (
      <div className="recipient-requisites">
        <div className="requisites-empty">Реквизиты не указаны</div>
      </div>
    );
  }

  return (
    <div className="recipient-requisites">
      <div className="requisites-grid">
        {rows.map((row) => (
          <div key={row.key} className="requisites-item">
            <span className="requisites-label">{row.label}:</span>
            <span className="requisites-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const getDocumentStatus = (doc: DealDocument) => {
  const success = typeof doc.success_added === 'boolean' ? doc.success_added : undefined;
  const description = typeof doc.success_added_desc === 'string' ? doc.success_added_desc : null;

  if (success === true) {
    return { label: 'Добавлен', className: 'badge badge-success', description };
  }
  if (success === false) {
    return { label: 'Ошибка', className: 'badge badge-error', description };
  }
  return { label: '—', className: 'badge badge-neutral', description };
};

export default function DealPage({ params }: { params: { dealId: string } }) {
  const router = useRouter();
  const { dealId } = params;

  const {
    deal,
    loading,
    error,
    fetchDeal,
    executeDeal,
    rejectDeal,
    cancelFromCorrection,
    checkCompliance,
  } = useDeal(dealId);

  const [expandedRecipient, setExpandedRecipient] = useState<number | null>(null);
  const [executeModalOpen, setExecuteModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [complianceResult, setComplianceResult] = useState<ComplianceCheckPayment[] | null>(null);
  const [selectedRecipients, setSelectedRecipients] = useState<number[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const closeExecuteModal = () => {
    setExecuteModalOpen(false);
    setSelectedRecipients([]);
  };

  const payerDocuments = useMemo(() => {
    if (!deal?.payers) return [];
    return deal.payers.flatMap((payer, payerIndex) =>
      (payer.documents || []).map((doc, docIndex) => ({
        id: `${payerIndex}-${docIndex}`,
        payer,
        doc,
      }))
    );
  }, [deal?.payers]);

  if (loading && !deal) {
    return (
      <div className="deal-detail-page">
        <div className="deal-skeleton">
          <div className="skeleton-line wide" />
          <div className="skeleton-line" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
        <style jsx>{`
          .deal-detail-page {
            max-width: 1200px;
          }

          .deal-skeleton {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .skeleton-line {
            height: 20px;
            background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: 6px;
            width: 40%;
          }

          .skeleton-line.wide {
            width: 70%;
            height: 28px;
          }

          .skeleton-card {
            height: 160px;
            border-radius: 14px;
            background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
          }

          @keyframes shimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
        `}</style>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="deal-detail-page">
        <div className="error-banner">
          <span>{error || 'Сделка не найдена'}</span>
        </div>
        <button onClick={() => router.push('/deals')} className="btn btn-ghost btn-sm">
          ← Вернуться к списку
        </button>
        <style jsx>{`
          .deal-detail-page {
            max-width: 1200px;
          }

          .error-banner {
            margin-bottom: 16px;
          }
        `}</style>
      </div>
    );
  }

  const actions = getAvailableActions(deal.status);
  const executeDisabled = deal.status === 'partial' && selectedRecipients.length === 0;

  const handleExecute = async () => {
    setActionLoading(true);
    try {
      const recipients = selectedRecipients.length > 0 ? selectedRecipients : undefined;
      await executeDeal(recipients);
      setExecuteModalOpen(false);
      setSelectedRecipients([]);
    } catch {
      // Ошибка отображается в error
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await rejectDeal();
      setRejectModalOpen(false);
    } catch {
      // Ошибка отображается в error
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelFromCorrection = async () => {
    setActionLoading(true);
    try {
      await cancelFromCorrection();
      setCancelModalOpen(false);
    } catch {
      // Ошибка отображается в error
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckCompliance = async () => {
    setActionLoading(true);
    try {
      const result = await checkCompliance();
      setComplianceResult(result);
    } catch {
      // Ошибка отображается в error
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="deal-detail-page">
      <header className="page-header">
        <button onClick={() => router.push('/deals')} className="btn btn-ghost btn-sm">
          ← Назад к списку
        </button>
        <div className="page-header-flex deal-header">
          <div>
            <h1 className="page-title">Сделка</h1>
            <div className="deal-id">{deal.id}</div>
            {deal.ext_key ? (
              <div className="deal-ext-key">
                Внешний ключ: <span className="code">{deal.ext_key}</span>
              </div>
            ) : null}
          </div>
          <span className={`badge deal-status-badge status-${deal.status} ${DEAL_STATUS_COLORS[deal.status]}`}>
            {DEAL_STATUS_LABELS[deal.status]}
          </span>
        </div>
      </header>

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={fetchDeal} className="error-retry">
            Повторить
          </button>
        </div>
      ) : null}

      <div className="deal-actions">
        {actions.canExecute ? (
          <button onClick={() => setExecuteModalOpen(true)} className="btn btn-primary">
            {deal.status === 'partial' ? 'Исполнить частично' : 'Исполнить'}
          </button>
        ) : null}

        {actions.canEdit ? (
          <button onClick={() => router.push(`/deals/${dealId}/edit`)} className="btn btn-secondary">
            Редактировать
          </button>
        ) : null}

        {actions.canReject ? (
          <button onClick={() => setRejectModalOpen(true)} className="btn btn-danger">
            Отменить
          </button>
        ) : null}

        {actions.canCancelFromCorrection ? (
          <button onClick={() => setCancelModalOpen(true)} className="btn btn-secondary">
            Отменить из коррекции
          </button>
        ) : null}

        {(actions.canExecute || actions.canEdit) ? (
          <button onClick={handleCheckCompliance} disabled={actionLoading} className="btn btn-ghost">
            Проверить комплаенс
          </button>
        ) : null}
      </div>

      {complianceResult ? (
        <div className="card compliance-card">
          <div className="card-header">
            <h2 className="card-title">Результат проверки комплаенс</h2>
            <button onClick={() => setComplianceResult(null)} className="btn btn-ghost btn-sm">
              Скрыть
            </button>
          </div>
          <div className="compliance-results">
            {complianceResult.map((item) => (
              <div key={item.number} className="compliance-item">
                <span className={`compliance-icon ${item.approved ? 'approved' : 'rejected'}`}>
                  {item.approved ? '✓' : '✗'}
                </span>
                <div>
                  <div className="compliance-title">Получатель #{item.number}</div>
                  {item.messages.map((msg, index) => (
                    <div
                      key={index}
                      className={`compliance-message ${msg.level === 'ERROR' ? 'error' : 'warning'}`}
                    >
                      [{msg.level}] {msg.text}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Основная информация</h2>
        </div>
        <div className="grid grid-3">
          <div className="stat-card">
            <div className="stat-label">Общая сумма</div>
            <div className="stat-value">{formatAmount(deal.amount)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Создана</div>
            <div>{formatDate(deal.created_at)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Обновлена</div>
            <div>{formatDate(deal.updated_at)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Плательщики</h2>
        </div>
        <div className="table-wrapper">
          <table className="table table-mobile-cards">
            <thead>
              <tr>
                <th>Виртуальный счёт</th>
                <th>Сумма</th>
                <th>Исполнено</th>
              </tr>
            </thead>
            <tbody>
              {deal.payers.map((payer, index) => (
                <tr key={`${payer.virtual_account}-${index}`}>
                  <td data-label="Виртуальный счёт">
                    <Link href={`/virtual-accounts/${payer.virtual_account}`} className="link-mono">
                      {payer.virtual_account.slice(0, 8)}...
                    </Link>
                  </td>
                  <td data-label="Сумма" className="money">
                    {formatAmount(payer.amount)}
                  </td>
                  <td data-label="Исполнено">
                    {payer.executed === true ? '✓' : payer.executed === false ? '✗' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {payerDocuments.length > 0 ? (
          <div className="payer-documents">
            <h3 className="section-subtitle">Документы</h3>
            <div className="documents-list">
              {payerDocuments.map(({ id, payer, doc }) => {
                const status = getDocumentStatus(doc);
                const typeLabel = typeof doc.type === 'string' ? doc.type : 'Документ';
                const fileName = typeof doc.file_name === 'string' ? doc.file_name : null;
                return (
                  <div key={id} className="document-item">
                    <div>
                      <div className="document-title">{typeLabel}</div>
                      <div className="document-meta">
                        Плательщик: <span className="code">{payer.virtual_account.slice(0, 8)}...</span>
                      </div>
                      {fileName ? <div className="document-meta">Файл: {fileName}</div> : null}
                      {status.description ? (
                        <div className="document-meta document-description">{status.description}</div>
                      ) : null}
                    </div>
                    <span className={status.className}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Получатели</h2>
        </div>
        <div className="table-wrapper">
          <table className="table table-mobile-cards">
            <thead>
              <tr>
                <th>№</th>
                <th>Тип</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Платёж</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {deal.recipients.map((recipient) => (
                <Fragment key={recipient.number}>
                  <tr
                    className="recipient-row"
                    onClick={() =>
                      setExpandedRecipient(expandedRecipient === recipient.number ? null : recipient.number)
                    }
                  >
                    <td data-label="№">{recipient.number}</td>
                    <td data-label="Тип">{RECIPIENT_TYPE_LABELS[recipient.type] || recipient.type}</td>
                    <td data-label="Сумма" className="money">
                      {formatAmount(recipient.amount)}
                    </td>
                    <td data-label="Статус">
                      <span
                        className={`badge recipient-status-badge status-${recipient.status} ${RECIPIENT_STATUS_COLORS[recipient.status]}`}
                      >
                        {RECIPIENT_STATUS_LABELS[recipient.status]}
                      </span>
                    </td>
                    <td data-label="Платёж">
                      {recipient.payment ? (
                        <Link
                          href={`/payments/${recipient.payment.id}`}
                          className="link-mono"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {recipient.payment.id.slice(0, 8)}...
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td data-label="Ошибка" className="recipient-error">
                      {recipient.error_reason || '—'}
                    </td>
                  </tr>
                  {expandedRecipient === recipient.number ? (
                    <tr className="recipient-details-row">
                      <td colSpan={6}>
                        <RecipientRequisites recipient={recipient} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={executeModalOpen}
        onClose={closeExecuteModal}
        title="Исполнение сделки"
        footer={
          <>
            <button onClick={closeExecuteModal} className="btn btn-secondary">
              Отмена
            </button>
            <button onClick={handleExecute} disabled={actionLoading || executeDisabled} className="btn btn-primary">
              {actionLoading ? 'Выполняется...' : 'Исполнить'}
            </button>
          </>
        }
      >
        {deal.status === 'partial' ? (
          <div className="modal-section">
            <p className="modal-text">Выберите получателей для исполнения:</p>
            <div className="recipient-checkboxes">
              {deal.recipients
                .filter((recipient) => recipient.status === 'new' || recipient.status === 'reject')
                .map((recipient) => (
                  <label key={recipient.number} className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.includes(recipient.number)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedRecipients((prev) => [...prev, recipient.number]);
                        } else {
                          setSelectedRecipients((prev) => prev.filter((n) => n !== recipient.number));
                        }
                      }}
                    />
                    <span>
                      #{recipient.number} — {RECIPIENT_TYPE_LABELS[recipient.type]} — {formatAmount(recipient.amount)}
                    </span>
                  </label>
                ))}
            </div>
            {executeDisabled ? (
              <div className="modal-hint">Выберите хотя бы одного получателя</div>
            ) : null}
          </div>
        ) : (
          <p className="modal-text">Вы уверены, что хотите исполнить сделку?</p>
        )}
      </Modal>

      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Отмена сделки"
        footer={
          <>
            <button onClick={() => setRejectModalOpen(false)} className="btn btn-secondary">
              Отмена
            </button>
            <button onClick={handleReject} disabled={actionLoading} className="btn btn-danger">
              {actionLoading ? 'Выполняется...' : 'Подтвердить отмену'}
            </button>
          </>
        }
      >
        <p className="modal-text modal-text-danger">
          Сделка будет отменена. Это действие необратимо.
        </p>
      </Modal>

      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Отмена из коррекции"
        footer={
          <>
            <button onClick={() => setCancelModalOpen(false)} className="btn btn-secondary">
              Отмена
            </button>
            <button onClick={handleCancelFromCorrection} disabled={actionLoading} className="btn btn-primary">
              {actionLoading ? 'Выполняется...' : 'Подтвердить'}
            </button>
          </>
        }
      >
        <p className="modal-text">
          Сделка будет отменена. Уже исполненные платежи останутся без изменений.
        </p>
      </Modal>

      <style jsx>{`
        .deal-detail-page {
          max-width: 1200px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .deal-header {
          align-items: flex-start;
        }

        .deal-id {
          font-family: var(--font-mono);
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: 6px;
          word-break: break-all;
        }

        .deal-ext-key {
          font-size: 13px;
          color: var(--text-tertiary);
        }

        .deal-status-badge {
          font-size: 13px;
          padding: 6px 12px;
          border-radius: 8px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .deal-status-badge.status-new {
          background: var(--bg-tertiary);
        }

        .deal-status-badge.status-in_process {
          background: var(--accent-bg);
          color: var(--accent-color);
        }

        .deal-status-badge.status-partial {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .deal-status-badge.status-closed {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .deal-status-badge.status-rejected,
        .deal-status-badge.status-canceled_by_platform {
          background: var(--color-error-bg);
          color: var(--color-error);
        }

        .deal-status-badge.status-correction {
          background: rgba(251, 146, 60, 0.18);
          color: #ea580c;
        }

        .deal-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .error-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--color-error-bg);
          color: var(--color-error);
          border-radius: 10px;
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

        .link-mono {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--accent-color);
          text-decoration: none;
        }

        .link-mono:hover {
          text-decoration: underline;
        }

        .payer-documents {
          margin-top: 20px;
        }

        .section-subtitle {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
          color: var(--text-primary);
        }

        .documents-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .document-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          padding: 12px 14px;
          background: var(--bg-secondary);
          border-radius: 10px;
        }

        .document-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .document-meta {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .document-description {
          margin-top: 6px;
        }

        .recipient-row {
          cursor: pointer;
        }

        .recipient-details-row td {
          padding: 0 16px 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .recipient-requisites {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 16px;
          margin-top: 12px;
        }

        .requisites-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .requisites-item {
          font-size: 13px;
          color: var(--text-secondary);
          display: flex;
          gap: 6px;
        }

        .requisites-label {
          color: var(--text-tertiary);
          flex-shrink: 0;
        }

        .requisites-value {
          font-family: var(--font-mono);
          word-break: break-word;
          color: var(--text-primary);
        }

        .requisites-empty {
          font-size: 13px;
          color: var(--text-tertiary);
        }

        .recipient-status-badge {
          font-size: 12px;
        }

        .recipient-status-badge.status-new {
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .recipient-status-badge.status-in_process {
          background: var(--accent-bg);
          color: var(--accent-color);
        }

        .recipient-status-badge.status-success {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .recipient-status-badge.status-reject {
          background: var(--color-error-bg);
          color: var(--color-error);
        }

        .recipient-status-badge.status-old {
          background: var(--bg-tertiary);
          color: var(--text-tertiary);
        }

        .recipient-error {
          color: var(--color-error);
          font-size: 12px;
        }

        .compliance-card {
          border: 1px solid var(--border-color);
        }

        .compliance-results {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .compliance-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--bg-secondary);
        }

        .compliance-icon {
          font-size: 18px;
          line-height: 1;
        }

        .compliance-icon.approved {
          color: var(--color-success);
        }

        .compliance-icon.rejected {
          color: var(--color-error);
        }

        .compliance-title {
          font-weight: 600;
          margin-bottom: 4px;
          font-size: 14px;
        }

        .compliance-message {
          font-size: 12px;
          margin-bottom: 4px;
        }

        .compliance-message.error {
          color: var(--color-error);
        }

        .compliance-message.warning {
          color: var(--color-warning);
        }

        .modal-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .modal-text {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .modal-text-danger {
          color: var(--color-error);
        }

        .modal-hint {
          font-size: 12px;
          color: var(--color-warning);
        }

        .recipient-checkboxes {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        @media (max-width: 767px) {
          .deal-detail-page {
            gap: 16px;
          }

          .deal-actions {
            flex-direction: column;
          }

          .deal-actions .btn {
            width: 100%;
          }

          .requisites-grid {
            grid-template-columns: 1fr;
          }

          .recipient-details-row {
            display: block;
            background: transparent;
            border: none;
          }

          .recipient-details-row td {
            padding: 0 12px 12px;
          }

          .document-item {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
