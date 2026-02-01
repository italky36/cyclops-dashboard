'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useDeal } from '@/hooks/useDeals';
import { useCyclops } from '@/hooks/useCyclops';
import { useAppStore } from '@/lib/store';
import { validateDealDocumentFile } from '@/lib/cyclops-document-utils';
import { getAvailableActions, RECIPIENT_TYPE_LABELS, formatAmount } from '@/lib/utils/deals';
import type { ComplianceCheckDealResult } from '@/types/cyclops/deals';
import type { DocumentListItem } from '@/types/cyclops';

// Import new components
import { DealHeader } from './components/DealHeader';
import { DealSummaryCards } from './components/DealSummaryCards';
import { DealPayers } from './components/DealPayers';
import { DealRecipients } from './components/DealRecipients';
import { DealDocuments } from './components/DealDocuments';

const DEAL_DOCUMENT_POLL_INTERVAL_MS = 3000;
const DEAL_DOCUMENT_POLL_TIMEOUT_MS = 90000;

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

const extractDocumentId = (record?: DocumentListItem | string | null) => {
  if (!record) return '';
  if (typeof record === 'string') return record;
  const raw = record.document_id ?? record.id;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  return '';
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

  const layer = useAppStore((s) => s.layer);
  const { listDocuments, uploadDocumentDeal, getVirtualAccount } = useCyclops({ layer });

  // State
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [, setBeneficiaryError] = useState<string | null>(null);
  const [, setBeneficiaryLoading] = useState(false);

  const [dealDocuments, setDealDocuments] = useState<DocumentListItem[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [documentType, setDocumentType] = useState('service_agreement');
  const [documentDate, setDocumentDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentFileError, setDocumentFileError] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [pendingDocumentId, setPendingDocumentId] = useState<string | null>(null);
  const [pollingStatus, setPollingStatus] = useState<'idle' | 'checking' | 'found' | 'timeout'>('idle');

  const pollingTimerRef = useRef<number | null>(null);
  const pollingStartedAtRef = useRef<number | null>(null);
  const beneficiaryFetchKeyRef = useRef<string | null>(null);

  const [executeModalOpen, setExecuteModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [complianceResult, setComplianceResult] = useState<ComplianceCheckDealResult | null>(null);
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [selectedRecipients, setSelectedRecipients] = useState<number[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  const closeExecuteModal = () => {
    setExecuteModalOpen(false);
    setSelectedRecipients([]);
  };

  const hasDocumentId = useCallback((documents: DocumentListItem[], documentId: string) => {
    return documents.some((doc) => extractDocumentId(doc) === documentId);
  }, []);

  const stopDocumentPolling = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    pollingStartedAtRef.current = null;
  }, []);

  const loadDealDocuments = useCallback(async (options?: { silent?: boolean }) => {
    if (!dealId) return [] as DocumentListItem[];
    if (!options?.silent) {
      setDocumentsLoading(true);
    }
    setDocumentsError(null);

    try {
      const filters: {
        deal_id: string;
        beneficiary?: { id: string };
      } = { deal_id: dealId };
      if (beneficiaryId) {
        filters.beneficiary = { id: beneficiaryId };
      }
      const response = await listDocuments({
        page: 1,
        per_page: 100,
        filters,
      });
      const listResult = response.result?.documents ?? response.result;
      const list = Array.isArray(listResult) ? listResult : [];
      const normalized = list.map((item) => (typeof item === 'string' ? { document_id: item } : item));
      setDealDocuments(normalized);
      return normalized;
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Не удалось получить документы';
      setDocumentsError(message);
      setDealDocuments([]);
      return [];
    } finally {
      if (!options?.silent) {
        setDocumentsLoading(false);
      }
    }
  }, [beneficiaryId, dealId, listDocuments]);

  const startDocumentPolling = useCallback(async (documentId: string) => {
    if (!documentId) return;
    stopDocumentPolling();
    pollingStartedAtRef.current = Date.now();
    setPollingStatus('checking');

    const poll = async () => {
      const documents = await loadDealDocuments({ silent: true });
      if (hasDocumentId(documents, documentId)) {
        setPollingStatus('found');
        setPendingDocumentId(null);
        stopDocumentPolling();
        return;
      }
      const startedAt = pollingStartedAtRef.current || Date.now();
      if (Date.now() - startedAt >= DEAL_DOCUMENT_POLL_TIMEOUT_MS) {
        setPollingStatus('timeout');
        stopDocumentPolling();
        return;
      }
      pollingTimerRef.current = window.setTimeout(poll, DEAL_DOCUMENT_POLL_INTERVAL_MS);
    };

    await poll();
  }, [hasDocumentId, loadDealDocuments, stopDocumentPolling]);

  const checkPendingDocumentNow = useCallback(async () => {
    if (!pendingDocumentId) return;
    setPollingStatus('checking');
    const documents = await loadDealDocuments({ silent: true });
    if (hasDocumentId(documents, pendingDocumentId)) {
      setPollingStatus('found');
      setPendingDocumentId(null);
      stopDocumentPolling();
      return;
    }
    setPollingStatus('timeout');
  }, [hasDocumentId, loadDealDocuments, pendingDocumentId, stopDocumentPolling]);

  const handleDocumentFileChange = (file: File | null) => {
    setDocumentFile(file);
    setUploadMessage(null);
    const validationError = file ? validateDealDocumentFile(file) : 'Выберите файл';
    setDocumentFileError(validationError);
  };

  const handleDealDocumentUpload = async () => {
    setUploadMessage(null);
    if (!beneficiaryId) {
      setUploadMessage('В сделке нет beneficiary_id — загрузка документа невозможна');
      return;
    }
    if (!documentDate) {
      setUploadMessage('Укажите дату документа');
      return;
    }
    if (!documentNumber.trim()) {
      setUploadMessage('Укажите номер документа');
      return;
    }
    if (!documentFile) {
      setDocumentFileError('Выберите файл');
      return;
    }
    const validationError = validateDealDocumentFile(documentFile);
    if (validationError) {
      setDocumentFileError(validationError);
      return;
    }

    setUploadingDocument(true);
    try {
      const result = await uploadDocumentDeal({
        beneficiary_id: beneficiaryId,
        deal_id: dealId,
        document_type: documentType,
        document_date: documentDate,
        document_number: documentNumber.trim(),
        file: documentFile,
      });

      const documentId = typeof result?.document_id === 'string'
        ? result.document_id
        : typeof (result as { id?: unknown } | undefined)?.id === 'string'
          ? (result as { id?: string }).id!
          : '';

      setUploadMessage(documentId ? `Документ отправлен. ID: ${documentId}` : 'Документ отправлен');
      setDocumentFile(null);
      setDocumentFileError(null);
      setPendingDocumentId(documentId || null);
      if (documentId) {
        await startDocumentPolling(documentId);
      } else {
        await loadDealDocuments({ silent: true });
      }
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Ошибка при загрузке документа';
      setUploadMessage(message);
    } finally {
      setUploadingDocument(false);
    }
  };

  useEffect(() => {
    if (!deal) return;

    const directBeneficiary = (deal as { beneficiary_id?: string }).beneficiary_id;
    if (directBeneficiary && directBeneficiary !== 'undefined') {
      setBeneficiaryId(directBeneficiary);
      setBeneficiaryError(null);
      setBeneficiaryLoading(false);
      return;
    }

    const payerAccount = deal.payers?.[0]?.virtual_account;
    if (!payerAccount) {
      setBeneficiaryId(null);
      setBeneficiaryError('В сделке нет beneficiary_id — загрузка документа невозможна');
      setBeneficiaryLoading(false);
      return;
    }

    const fetchKey = `${deal.id}:${payerAccount}`;
    if (beneficiaryFetchKeyRef.current === fetchKey) return;
    beneficiaryFetchKeyRef.current = fetchKey;

    setBeneficiaryLoading(true);
    setBeneficiaryError(null);

    getVirtualAccount(payerAccount)
      .then((response) => {
        const virtualAccount = response.result?.virtual_account;
        const resolved = virtualAccount?.beneficiary_id;
        if (resolved && typeof resolved === 'string') {
          setBeneficiaryId(resolved);
          setBeneficiaryError(null);
        } else {
          setBeneficiaryId(null);
          setBeneficiaryError('В сделке нет beneficiary_id — загрузка документа невозможна');
        }
      })
      .catch(() => {
        setBeneficiaryId(null);
        setBeneficiaryError('Не удалось получить beneficiary_id для сделки');
      })
      .finally(() => {
        setBeneficiaryLoading(false);
      });
  }, [deal, getVirtualAccount]);

  useEffect(() => {
    if (!dealId) return;
    loadDealDocuments();
  }, [dealId, beneficiaryId, loadDealDocuments]);

  useEffect(() => () => {
    stopDocumentPolling();
  }, [stopDocumentPolling]);

  const compliancePayments = useMemo(
    () => complianceResult?.compliance_check_payments ?? [],
    [complianceResult?.compliance_check_payments]
  );
  const hasComplianceMessages = useMemo(
    () => compliancePayments.some((item) => item.messages.length > 0),
    [compliancePayments]
  );

  const complianceCopyText = useMemo(() => {
    if (!complianceResult) return '';
    const header = `Deal ${deal?.id ?? dealId} compliance_check_deal`;
    if (compliancePayments.length === 0) {
      return `${header}\nNo issues reported.`;
    }
    const lines = compliancePayments.flatMap((item) => {
      const status = item.approved ? 'APPROVED' : 'REJECTED';
      if (!item.messages.length) {
        return [`Recipient #${item.number} - ${status}`];
      }
      return item.messages.map(
        (msg, index) => `Recipient #${item.number} - ${status} - ${index + 1}. [${msg.level}] ${msg.text}`
      );
    });
    return [header, ...lines].join('\n');
  }, [compliancePayments, complianceResult, deal?.id, dealId]);

  const handleCopyCompliance = async () => {
    if (!complianceCopyText) return;
    try {
      await navigator.clipboard.writeText(complianceCopyText);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  };

  const handleOpenComplianceModal = async () => {
    if (complianceResult) {
      setComplianceModalOpen(true);
      return;
    }
    setActionLoading(true);
    setComplianceError(null);
    try {
      const result = await checkCompliance();
      setComplianceResult(result);
      setComplianceError(null);
      setComplianceModalOpen(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка проверки комплаенс';
      setComplianceError(errorMessage);
      setComplianceModalOpen(true);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckCompliance = async () => {
    setActionLoading(true);
    setComplianceError(null);
    try {
      const result = await checkCompliance();
      setComplianceResult(result);
      setComplianceError(null);
      setComplianceModalOpen(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Ошибка проверки комплаенс';
      setComplianceError(errorMessage);
      setComplianceModalOpen(true);
    } finally {
      setActionLoading(false);
    }
  };

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

  return (
    <div className="deal-detail-page">
      <DealHeader
        deal={deal}
        actions={actions}
        loading={actionLoading}
        onExecute={() => setExecuteModalOpen(true)}
        onReject={() => setRejectModalOpen(true)}
        onCancelFromCorrection={() => setCancelModalOpen(true)}
        onCheckCompliance={handleCheckCompliance}
        onOpenComplianceModal={handleOpenComplianceModal}
        onEdit={() => router.push(`/deals/${dealId}/edit`)}
      />

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={fetchDeal} className="error-retry">
            Повторить
          </button>
        </div>
      ) : null}

      <DealSummaryCards
        deal={deal}
        documents={dealDocuments}
        complianceResult={complianceResult}
        onComplianceClick={handleOpenComplianceModal}
      />

      {deal.ext_key && (
        <div className="ext-key-card">
          <div className="ext-key-label">Внешний ключ</div>
          <div className="ext-key-value">{deal.ext_key}</div>
        </div>
      )}

      <DealPayers payers={deal.payers} />

      <DealRecipients
        recipients={deal.recipients}
        dealStatus={deal.status}
        selectedRecipients={selectedRecipients}
        onSelectRecipient={setSelectedRecipients}
        canSelect={deal.status === 'partial'}
      />

      <DealDocuments
        documents={dealDocuments}
        loading={documentsLoading}
        error={documentsError}
        uploadState={{
          uploading: uploadingDocument,
          message: uploadMessage,
          documentType,
          documentDate,
          documentNumber,
          documentFile,
          fileError: documentFileError,
          pollingStatus,
        }}
        onDocumentTypeChange={setDocumentType}
        onDocumentDateChange={setDocumentDate}
        onDocumentNumberChange={setDocumentNumber}
        onDocumentFileChange={handleDocumentFileChange}
        onUpload={handleDealDocumentUpload}
        onCheckNow={checkPendingDocumentNow}
        beneficiaryId={beneficiaryId}
      />

      {/* Compliance Modal */}
      <Modal
        open={complianceModalOpen}
        onClose={() => {
          setComplianceModalOpen(false);
          setComplianceError(null);
        }}
        title="Детали комплаенс-проверки"
        footer={
          <>
            <button onClick={() => {
              setComplianceModalOpen(false);
              setComplianceError(null);
            }} className="btn btn-secondary">
              Закрыть
            </button>
            {!complianceError && (
              <button onClick={handleCopyCompliance} className="btn btn-primary" disabled={!hasComplianceMessages}>
                {copyState === 'copied' ? 'Скопировано' : copyState === 'error' ? 'Ошибка' : 'Копировать'}
              </button>
            )}
          </>
        }
      >
        {complianceError ? (
          <div className="compliance-error-container">
            <div className="compliance-error-icon">⚠️</div>
            <div className="compliance-error-content">
              <div className="compliance-error-title">Ошибка проверки комплаенс</div>
              <div className="compliance-error-message">{complianceError}</div>
            </div>
          </div>
        ) : compliancePayments.length > 0 ? (
          <>
            {(() => {
              const approved = compliancePayments.filter(p => p.approved).length;
              const rejected = compliancePayments.filter(p => !p.approved).length;
              const withIssues = compliancePayments.filter(p => p.messages.length > 0).length;

              return (
                <div className="compliance-summary">
                  <div className="compliance-summary-item">
                    <span className="compliance-summary-label">Всего проверено:</span>
                    <span className="compliance-summary-value">{compliancePayments.length}</span>
                  </div>
                  <div className="compliance-summary-item success">
                    <span className="compliance-summary-label">Одобрено:</span>
                    <span className="compliance-summary-value">{approved}</span>
                  </div>
                  <div className="compliance-summary-item error">
                    <span className="compliance-summary-label">Отклонено:</span>
                    <span className="compliance-summary-value">{rejected}</span>
                  </div>
                  {withIssues > 0 && (
                    <div className="compliance-summary-item warning">
                      <span className="compliance-summary-label">С замечаниями:</span>
                      <span className="compliance-summary-value">{withIssues}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="compliance-details">
              {compliancePayments.map((item) => {
                const recipient = deal?.recipients.find(r => r.number === item.number);
                const recipientType = recipient ? RECIPIENT_TYPE_LABELS[recipient.type] : null;
                const recipientAmount = recipient ? formatAmount(recipient.amount) : null;

                return (
                  <div key={item.number} className={`compliance-detail-item ${!item.approved ? 'rejected' : ''}`}>
                    <div className="compliance-detail-header">
                      <div className="compliance-detail-title-block">
                        <span className="compliance-detail-title">Получатель #{item.number}</span>
                        {recipientType && (
                          <span className="compliance-detail-subtitle">{recipientType} · {recipientAmount}</span>
                        )}
                      </div>
                      <span className={`compliance-detail-badge ${item.approved ? 'approved' : 'rejected'}`}>
                        {item.approved ? '✓ Одобрено' : '✗ Отклонено'}
                      </span>
                    </div>
                    {item.messages.length > 0 ? (
                      <div className="compliance-detail-messages">
                        {item.messages.map((message, index) => (
                          <div
                            key={`${message.level}-${index}`}
                            className={`compliance-detail-message ${message.level.toLowerCase()}`}
                          >
                            <span className="compliance-detail-level">{message.level}</span>
                            <span className="compliance-detail-text">{message.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="compliance-detail-ok">Проверка пройдена без замечаний</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="modal-text">Комплаенс не вернул данных по платежам сделки.</p>
        )}
      </Modal>

      {/* Execute Modal */}
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

      {/* Reject Modal */}
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

      {/* Cancel from Correction Modal */}
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
          gap: 20px;
          padding-bottom: 40px;
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

        .ext-key-card {
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-color);
        }

        .ext-key-label {
          font-size: 11px;
          color: var(--text-tertiary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .ext-key-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'Courier New', monospace;
        }

        .compliance-error-container {
          display: flex;
          gap: 12px;
          padding: 16px;
          background: var(--color-error-bg);
          border-radius: 10px;
          border: 1px solid var(--color-error);
        }

        .compliance-error-icon {
          font-size: 24px;
          line-height: 1;
        }

        .compliance-error-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .compliance-error-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-error);
        }

        .compliance-error-message {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .compliance-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
          padding: 14px;
          background: var(--bg-secondary);
          border-radius: 10px;
          margin-bottom: 16px;
        }

        .compliance-summary-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .compliance-summary-label {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .compliance-summary-value {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .compliance-summary-item.success .compliance-summary-value {
          color: var(--color-success);
        }

        .compliance-summary-item.error .compliance-summary-value {
          color: var(--color-error);
        }

        .compliance-summary-item.warning .compliance-summary-value {
          color: var(--color-warning);
        }

        .compliance-details {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .compliance-detail-item {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 2px solid transparent;
        }

        .compliance-detail-item.rejected {
          border-color: var(--color-error);
          background: var(--color-error-bg);
        }

        .compliance-detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .compliance-detail-title-block {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }

        .compliance-detail-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .compliance-detail-subtitle {
          font-size: 12px;
          color: var(--text-tertiary);
        }

        .compliance-detail-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .compliance-detail-badge.approved {
          background: var(--color-success-bg);
          color: var(--color-success);
        }

        .compliance-detail-badge.rejected {
          background: var(--color-error-bg);
          color: var(--color-error);
        }

        .compliance-detail-messages {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .compliance-detail-message {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 10px 12px;
          border-radius: 6px;
          background: var(--bg-tertiary);
          border-left: 3px solid var(--border-color);
        }

        .compliance-detail-message.error {
          border-left-color: var(--color-error);
          background: rgba(239, 68, 68, 0.1);
        }

        .compliance-detail-message.warning {
          border-left-color: var(--color-warning);
          background: rgba(251, 191, 36, 0.1);
        }

        .compliance-detail-ok {
          font-size: 12px;
          color: var(--color-success);
          padding: 6px 10px;
          background: var(--color-success-bg);
          border-radius: 6px;
        }

        .compliance-detail-level {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .compliance-detail-text {
          font-size: 13px;
          color: var(--text-primary);
          line-height: 1.5;
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
          .compliance-summary {
            grid-template-columns: repeat(2, 1fr);
          }

          .compliance-detail-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .compliance-detail-badge {
            align-self: flex-start;
          }

          .compliance-error-container {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
