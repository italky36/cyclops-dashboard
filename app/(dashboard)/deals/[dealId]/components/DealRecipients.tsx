'use client';

import { useState, useMemo, Fragment } from 'react';
import type { DealRecipientInfo, DealStatus } from '@/types/cyclops/deals';
import { RECIPIENT_TYPE_LABELS, formatAmount } from '@/lib/utils/deals';

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
        return ['card_number_crypto_base64', 'purpose', 'inn'];
      case 'ndfl':
        return ['account', 'bank_code', 'inn', 'kbk', 'oktmo', 'purpose'];
      case 'commission':
        return ['name', 'kpp', 'purpose'];
      case 'ndfl_to_virtual_account':
        return ['virtual_account'];
      default:
        return [];
    }
  })();

  const otherKeys = Object.keys(requisites).filter((key) => !preferredKeys.includes(key));
  const orderedKeys = [...preferredKeys, ...otherKeys].filter((key) => key in requisites);

  return (
    <div className="requisites-grid">
      {orderedKeys.map((key) => {
        const value = requisites[key];
        const displayValue = key === 'card_number_crypto_base64' ? maskCardNumber(String(value)) : formatRequisiteValue(value);

        return (
          <div key={key} className="requisite-item">
            <div className="requisite-label">{key}</div>
            <div className="requisite-value">{displayValue}</div>
          </div>
        );
      })}

      <style jsx>{`
        .requisites-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
          padding: 12px;
          background: var(--bg-tertiary);
          border-radius: 8px;
        }

        .requisite-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .requisite-label {
          font-size: 11px;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .requisite-value {
          font-size: 13px;
          color: var(--text-primary);
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}

function getRequisitesPreview(recipient: DealRecipientInfo): string {
  const requisites = (recipient.requisites || {}) as Record<string, unknown>;

  switch (recipient.type) {
    case 'payment_contract':
      return requisites.name ? String(requisites.name) : requisites.inn ? `ИНН ${requisites.inn}` : '—';
    case 'payment_contract_by_sbp':
    case 'payment_contract_by_sbp_v2':
      return `${requisites.last_name || ''} ${requisites.first_name || ''}`.trim() || String(requisites.phone_number || '—');
    case 'payment_contract_to_card':
      return maskCardNumber(String(requisites.card_number_crypto_base64 || ''));
    case 'ndfl':
      return `КБК ${requisites.kbk || '—'}`;
    case 'commission':
      return String(requisites.name || '—');
    case 'ndfl_to_virtual_account':
      const va = String(requisites.virtual_account || '');
      return va ? `${va.slice(0, 8)}...` : '—';
    default:
      return '—';
  }
}

interface DealRecipientsProps {
  recipients: DealRecipientInfo[];
  dealStatus: DealStatus;
  selectedRecipients: number[];
  onSelectRecipient?: (numbers: number[]) => void;
  canSelect?: boolean;
}

export function DealRecipients({ recipients, dealStatus, selectedRecipients, onSelectRecipient, canSelect = false }: DealRecipientsProps) {
  const [expandedRecipient, setExpandedRecipient] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredRecipients = useMemo(() => {
    if (statusFilter === 'all') return recipients;
    return recipients.filter((r) => r.status === statusFilter);
  }, [recipients, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: recipients.length };
    recipients.forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return counts;
  }, [recipients]);

  const handleSelectRecipient = (number: number) => {
    if (!canSelect || !onSelectRecipient) return;

    const newSelection = selectedRecipients.includes(number) ? selectedRecipients.filter((n) => n !== number) : [...selectedRecipients, number];

    onSelectRecipient(newSelection);
  };

  const handleSelectAll = () => {
    if (!canSelect || !onSelectRecipient) return;

    if (selectedRecipients.length === filteredRecipients.length) {
      onSelectRecipient([]);
    } else {
      onSelectRecipient(filteredRecipients.map((r) => r.number));
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Получатели ({recipients.length})</h2>
          <div className="status-filters">
            <button
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Все ({statusCounts.all || 0})
            </button>
            {Object.entries(statusCounts).map(
              ([status, count]) =>
                status !== 'all' &&
                count > 0 && (
                  <button
                    key={status}
                    className={`filter-btn ${statusFilter === status ? 'active' : ''}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {RECIPIENT_STATUS_LABELS[status]} ({count})
                  </button>
                )
            )}
          </div>
        </div>

        <div className="recipients-table-container">
          <table className="recipients-table">
            <thead>
              <tr>
                {canSelect && dealStatus === 'partial' && (
                  <th className="th-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRecipients.length === filteredRecipients.length && filteredRecipients.length > 0}
                      onChange={handleSelectAll}
                      className="checkbox"
                    />
                  </th>
                )}
                <th className="th-number">№</th>
                <th className="th-type">Тип</th>
                <th className="th-amount">Сумма</th>
                <th className="th-status">Статус</th>
                <th className="th-preview">Реквизиты</th>
                <th className="th-actions"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={canSelect && dealStatus === 'partial' ? 7 : 6} className="td-empty">
                    Нет получателей с выбранным статусом
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((recipient) => (
                  <Fragment key={recipient.number}>
                    <tr className={`recipient-row status-${recipient.status}`}>
                      {canSelect && dealStatus === 'partial' && (
                        <td className="td-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedRecipients.includes(recipient.number)}
                            onChange={() => handleSelectRecipient(recipient.number)}
                            className="checkbox"
                          />
                        </td>
                      )}
                      <td className="td-number">#{recipient.number}</td>
                      <td className="td-type">
                        <span className="type-label">{RECIPIENT_TYPE_LABELS[recipient.type]}</span>
                      </td>
                      <td className="td-amount">{formatAmount(recipient.amount)}</td>
                      <td className="td-status">
                        <span className={`badge ${RECIPIENT_STATUS_COLORS[recipient.status]}`}>
                          {RECIPIENT_STATUS_LABELS[recipient.status]}
                        </span>
                      </td>
                      <td className="td-preview">
                        <span className="preview-text">{getRequisitesPreview(recipient)}</span>
                      </td>
                      <td className="td-actions">
                        <button
                          className="btn-expand"
                          onClick={() => setExpandedRecipient(expandedRecipient === recipient.number ? null : recipient.number)}
                        >
                          {expandedRecipient === recipient.number ? '▲' : '▼'}
                        </button>
                      </td>
                    </tr>
                    {expandedRecipient === recipient.number && (
                      <tr className="recipient-details-row">
                        <td colSpan={canSelect && dealStatus === 'partial' ? 7 : 6} className="td-details">
                          <RecipientRequisites recipient={recipient} />
                          {recipient.error_reason && (
                            <div className="error-reason">
                              <strong>Причина ошибки:</strong> {recipient.error_reason}
                            </div>
                          )}
                          {recipient.payment && (
                            <div className="payment-info">
                              <strong>Платёж:</strong> {recipient.payment.id} (статус: {recipient.payment.status})
                              {recipient.payment.meta?.error_code && (
                                <div className="payment-error">
                                  Код ошибки: {recipient.payment.meta.error_code}
                                  {recipient.payment.meta.code_description && ` — ${recipient.payment.meta.code_description}`}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx>{`
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .status-filters {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .filter-btn {
          padding: 6px 12px;
          font-size: 12px;
          border: 1px solid var(--border-color);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-weight: 500;
        }

        .filter-btn:hover {
          background: var(--bg-tertiary);
          border-color: var(--text-tertiary);
        }

        .filter-btn.active {
          background: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
        }

        .recipients-table-container {
          overflow-x: auto;
        }

        .recipients-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .recipients-table thead {
          background: var(--bg-secondary);
        }

        .recipients-table th {
          padding: 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 2px solid var(--border-color);
          word-break: break-word;
        }

        .th-checkbox {
          width: 40px;
        }

        .th-number {
          width: 60px;
        }

        .th-type {
          min-width: 140px;
        }

        .th-amount {
          min-width: 100px;
        }

        .th-status {
          min-width: 120px;
        }

        .th-preview {
          min-width: 200px;
        }

        .th-actions {
          width: 60px;
        }

        .recipient-row {
          border-bottom: 1px solid var(--border-color);
          transition: background 0.2s ease;
        }

        .recipient-row:hover {
          background: var(--bg-secondary);
        }

        .recipient-row.status-success {
          border-left: 3px solid var(--color-success);
        }

        .recipient-row.status-reject {
          border-left: 3px solid var(--color-error);
        }

        .recipient-row.status-in_process {
          border-left: 3px solid var(--color-warning);
        }

        .recipient-row td {
          padding: 14px 12px;
          font-size: 14px;
          color: var(--text-primary);
          word-break: break-word;
        }

        .td-checkbox,
        .td-number {
          font-weight: 600;
          color: var(--text-secondary);
        }

        .type-label {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .td-amount {
          font-weight: 600;
          font-family: 'Courier New', monospace;
        }

        .badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        .preview-text {
          font-size: 13px;
          color: var(--text-secondary);
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn-expand {
          padding: 6px 10px;
          background: transparent;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          cursor: pointer;
          font-size: 10px;
          color: var(--text-tertiary);
          transition: all 0.2s ease;
        }

        .btn-expand:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .td-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .recipient-details-row {
          background: var(--bg-secondary);
        }

        .td-details {
          padding: 16px;
        }

        .error-reason,
        .payment-info {
          margin-top: 12px;
          padding: 10px 12px;
          background: var(--bg-primary);
          border-radius: 6px;
          font-size: 13px;
        }

        .error-reason {
          border-left: 3px solid var(--color-error);
        }

        .payment-info {
          border-left: 3px solid var(--color-primary);
        }

        .payment-error {
          margin-top: 6px;
          color: var(--color-error);
          font-size: 12px;
        }

        .checkbox {
          cursor: pointer;
          width: 16px;
          height: 16px;
        }

        @media (max-width: 900px) {
          .recipients-table {
            font-size: 13px;
          }

          .th-preview {
            display: none;
          }

          .td-preview {
            display: none;
          }

          .recipients-table-container {
            overflow-x: hidden;
          }
        }

        @media (max-width: 600px) {
          .status-filters {
            width: 100%;
          }

          .filter-btn {
            flex: 1;
            text-align: center;
          }

          .recipients-table th,
          .recipients-table td {
            padding: 10px 8px;
          }

          .th-type,
          .td-type {
            display: none;
          }

          .th-number,
          .th-amount,
          .th-status,
          .th-actions {
            min-width: 0;
          }
        }
      `}</style>
    </>
  );
}
