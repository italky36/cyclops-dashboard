'use client';

import type { DealPayer } from '@/types/cyclops/deals';
import { formatAmount } from '@/lib/utils/deals';
import { CopyButton } from '@/components/ui/CopyButton';

interface DealPayersProps {
  payers: DealPayer[];
}

export function DealPayers({ payers }: DealPayersProps) {
  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Плательщики ({payers.length})</h2>
        </div>

        <div className="payers-grid">
          {payers.map((payer, index) => (
            <div key={index} className="payer-card">
              <div className="payer-header">
                <div className="payer-icon">💳</div>
                <div className="payer-info">
                  <div className="payer-label">Виртуальный счёт</div>
                  <div className="payer-account-row">
                    <span className="payer-account-value">{payer.virtual_account}</span>
                    <CopyButton text={payer.virtual_account} />
                  </div>
                </div>
                <div className="payer-amount">{formatAmount(payer.amount)}</div>
              </div>

              {payer.executed !== null && payer.executed !== undefined && (
                <div className={`payer-status ${payer.executed ? 'executed' : 'pending'}`}>
                  {payer.executed ? '✓ Исполнено' : '⏳ Ожидается'}
                </div>
              )}

              {payer.documents && payer.documents.length > 0 && (
                <div className="payer-documents">
                  <div className="documents-label">Документы:</div>
                  {payer.documents.map((doc, docIndex) => (
                    <div key={docIndex} className="document-item">
                      <span className="doc-type">{doc.type}</span>
                      {doc.file_name && <span className="doc-name">{doc.file_name}</span>}
                      {doc.success_added !== undefined && (
                        <span className={`doc-status ${doc.success_added ? 'success' : 'error'}`}>
                          {doc.success_added ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .payers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .payer-card {
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          transition: all 0.2s ease;
        }

        .payer-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .payer-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .payer-icon {
          font-size: 24px;
          line-height: 1;
        }

        .payer-info {
          flex: 1;
          min-width: 0;
        }

        .payer-label {
          font-size: 11px;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .payer-account-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .payer-account-value {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'Courier New', monospace;
          word-break: break-all;
          min-width: 0;
        }

        .payer-amount {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
        }

        .payer-status {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .payer-status.executed {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .payer-status.pending {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }

        .payer-documents {
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }

        .documents-label {
          font-size: 11px;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .document-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          background: var(--bg-tertiary);
          border-radius: 6px;
          margin-bottom: 6px;
          font-size: 12px;
        }

        .doc-type {
          color: var(--text-secondary);
          font-weight: 600;
        }

        .doc-name {
          flex: 1;
          color: var(--text-tertiary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .doc-status {
          font-size: 14px;
        }

        .doc-status.success {
          color: var(--color-success);
        }

        .doc-status.error {
          color: var(--color-error);
        }

        @media (max-width: 767px) {
          .payers-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
