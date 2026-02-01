'use client';

import { useRef } from 'react';
import type { DocumentListItem } from '@/types/cyclops';

interface DealDocumentsProps {
  documents: DocumentListItem[];
  loading?: boolean;
  error?: string | null;
  uploadState?: {
    uploading: boolean;
    message: string | null;
    documentType: string;
    documentDate: string;
    documentNumber: string;
    documentFile: File | null;
    fileError: string | null;
    pollingStatus: 'idle' | 'checking' | 'found' | 'timeout';
  };
  onDocumentTypeChange?: (type: string) => void;
  onDocumentDateChange?: (date: string) => void;
  onDocumentNumberChange?: (number: string) => void;
  onDocumentFileChange?: (file: File | null) => void;
  onUpload?: () => void;
  onCheckNow?: () => void;
  beneficiaryId?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const extractDocumentId = (record?: DocumentListItem | string | null) => {
  if (!record) return '';
  if (typeof record === 'string') return record;
  const raw = record.document_id ?? record.id;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
};

export function DealDocuments({
  documents,
  loading = false,
  error,
  uploadState,
  onDocumentTypeChange,
  onDocumentDateChange,
  onDocumentNumberChange,
  onDocumentFileChange,
  onUpload,
  onCheckNow,
  beneficiaryId,
}: DealDocumentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    onDocumentFileChange?.(file);
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const canUpload = !!beneficiaryId && !!onUpload;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Документы сделки ({documents.length})</h2>
        </div>

        {error && (
          <div className="error-banner">
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="loading-state">Загрузка документов...</div>
        ) : documents.length > 0 ? (
          <div className="documents-list">
            {documents.map((doc, index) => {
              const docId = extractDocumentId(doc);
              return (
                <div key={docId || index} className="document-card">
                  <div className="document-icon">📄</div>
                  <div className="document-info">
                    <div className="document-id">{docId || `Документ ${index + 1}`}</div>
                    {typeof doc === 'object' && doc.document_date && (
                      <div className="document-date">
                        {new Date(doc.document_date).toLocaleDateString('ru-RU')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <div className="empty-text">Нет загруженных документов</div>
          </div>
        )}

        {canUpload && (
          <>
            <div className="upload-section">
              <h3 className="upload-title">Загрузить новый документ</h3>

              {!beneficiaryId && (
                <div className="warning-banner">В сделке нет beneficiary_id — загрузка документа невозможна</div>
              )}

              <div className="upload-form">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Тип документа</label>
                    <select
                      className="form-input"
                      value={uploadState?.documentType || 'service_agreement'}
                      onChange={(e) => onDocumentTypeChange?.(e.target.value)}
                      disabled={uploadState?.uploading}
                    >
                      <option value="service_agreement">Договор на оказание услуг</option>
                      <option value="act">Акт выполненных работ</option>
                      <option value="invoice">Счёт</option>
                      <option value="other">Другое</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Дата документа</label>
                    <input
                      type="date"
                      className="form-input"
                      value={uploadState?.documentDate || ''}
                      onChange={(e) => onDocumentDateChange?.(e.target.value)}
                      disabled={uploadState?.uploading}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Номер документа</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Номер документа"
                      value={uploadState?.documentNumber || ''}
                      onChange={(e) => onDocumentNumberChange?.(e.target.value)}
                      disabled={uploadState?.uploading}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Файл</label>
                  <div className="file-input-group">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      style={{ display: 'none' }}
                      disabled={uploadState?.uploading}
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleFileClick} disabled={uploadState?.uploading}>
                      Выбрать файл
                    </button>
                    {uploadState?.documentFile && (
                      <div className="file-info">
                        <span className="file-name">{uploadState.documentFile.name}</span>
                        <span className="file-size">{formatFileSize(uploadState.documentFile.size)}</span>
                      </div>
                    )}
                  </div>
                  {uploadState?.fileError && <div className="field-error">{uploadState.fileError}</div>}
                </div>

                <button className="btn btn-primary" onClick={onUpload} disabled={uploadState?.uploading || !beneficiaryId}>
                  {uploadState?.uploading ? 'Загрузка...' : 'Загрузить документ'}
                </button>

                {uploadState?.message && <div className="upload-message">{uploadState.message}</div>}

                {uploadState?.pollingStatus === 'checking' && (
                  <div className="polling-status">
                    <div className="spinner"></div>
                    <span>Проверка добавления документа...</span>
                  </div>
                )}

                {uploadState?.pollingStatus === 'timeout' && (
                  <div className="polling-timeout">
                    <span>Документ не появился в списке за 60 секунд.</span>
                    <button className="btn btn-ghost btn-sm" onClick={onCheckNow}>
                      Проверить сейчас
                    </button>
                  </div>
                )}

                {uploadState?.pollingStatus === 'found' && <div className="polling-success">✓ Документ успешно добавлен</div>}
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .loading-state,
        .empty-state {
          padding: 40px 20px;
          text-align: center;
        }

        .loading-state {
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        .empty-icon {
          font-size: 48px;
          opacity: 0.5;
        }

        .empty-text {
          font-size: 14px;
          color: var(--text-tertiary);
        }

        .documents-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .document-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 1px solid var(--border-color);
          transition: all 0.2s ease;
        }

        .document-card:hover {
          background: var(--bg-tertiary);
        }

        .document-icon {
          font-size: 24px;
        }

        .document-info {
          flex: 1;
          min-width: 0;
        }

        .document-id {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: 'Courier New', monospace;
        }

        .document-date {
          font-size: 11px;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .upload-section {
          padding-top: 20px;
          border-top: 1px solid var(--border-color);
          margin-top: 20px;
        }

        .upload-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 16px;
        }

        .warning-banner {
          padding: 12px;
          background: var(--color-warning-bg);
          border-left: 3px solid var(--color-warning);
          border-radius: 6px;
          font-size: 13px;
          color: var(--text-primary);
          margin-bottom: 16px;
        }

        .upload-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .form-input {
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          font-size: 14px;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.2s ease;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        .form-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .file-input-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .file-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border-radius: 6px;
        }

        .file-name {
          font-size: 13px;
          color: var(--text-primary);
          font-weight: 500;
        }

        .file-size {
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .field-error {
          font-size: 12px;
          color: var(--color-error);
          margin-top: 4px;
        }

        .upload-message {
          padding: 10px 12px;
          background: var(--bg-secondary);
          border-radius: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .polling-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          background: var(--bg-secondary);
          border-radius: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid var(--border-color);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .polling-timeout {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--color-warning-bg);
          border-left: 3px solid var(--color-warning);
          border-radius: 6px;
          font-size: 13px;
          color: var(--text-primary);
        }

        .polling-success {
          padding: 12px;
          background: var(--color-success-bg);
          border-left: 3px solid var(--color-success);
          border-radius: 6px;
          font-size: 13px;
          color: var(--color-success);
          font-weight: 600;
        }

        @media (max-width: 767px) {
          .documents-list {
            grid-template-columns: 1fr;
          }

          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
