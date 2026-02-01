'use client';

import { useMemo, useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDeal } from '@/hooks/useDeals';
import { useCyclops } from '@/hooks/useCyclops';
import { useAppStore } from '@/lib/store';
import {
  DEAL_DOCUMENT_MIME_TYPES,
  MAX_DEAL_DOCUMENT_SIZE_BYTES,
  resolveDocumentMimeType,
  validateDealDocumentFile,
} from '@/lib/cyclops-document-utils';
import {
  DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS,
  RECIPIENT_TYPE_LABELS,
  formatAmount,
  formatDate,
  getAvailableActions,
} from '@/lib/utils/deals';
import type { ComplianceCheckDealResult, ComplianceCheckPayment, DealRecipientInfo } from '@/types/cyclops/deals';
import type { DocumentListItem } from '@/types/cyclops';

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

const getDocumentStatus = (doc: { success_added?: boolean | null; success_added_desc?: string | null }) => {
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

const DEAL_DOCUMENT_EXTENSIONS = ['.pdf', '.gif', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp'];
const DEAL_DOCUMENT_ACCEPT = [...DEAL_DOCUMENT_EXTENSIONS, ...DEAL_DOCUMENT_MIME_TYPES].join(',');
const DEAL_DOCUMENT_POLL_INTERVAL_MS = 3000;
const DEAL_DOCUMENT_POLL_TIMEOUT_MS = 90000;
const DEAL_DOCUMENT_TYPE_OPTIONS = [
  { value: 'service_agreement', label: 'Договор оказания услуг' },
];
const DEAL_DOCUMENT_TYPE_LABELS: Record<string, string> = {
  service_agreement: 'Договор оказания услуг',
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  return `${(size / (1024 * 1024)).toFixed(2)} МБ`;
};

const formatDateShort = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
};

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

  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [beneficiaryError, setBeneficiaryError] = useState<string | null>(null);
  const [beneficiaryLoading, setBeneficiaryLoading] = useState(false);

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

  const [expandedRecipient, setExpandedRecipient] = useState<number | null>(null);
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
          <button
            type="button"
            className={`badge deal-status-badge status-${deal.status} ${DEAL_STATUS_COLORS[deal.status]} compliance-clickable`}
            onClick={handleOpenComplianceModal}
            title="Показать детали комплаенс"
          >
            {DEAL_STATUS_LABELS[deal.status]}
          </button>
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

      {complianceResult?.compliance_check_payments?.length ? (
        <div className="card compliance-card">
          <div className="card-header">
            <h2 className="card-title">Результат проверки комплаенс</h2>
            <button onClick={() => setComplianceResult(null)} className="btn btn-ghost btn-sm">
              Скрыть
            </button>
          </div>
          <div className="compliance-results">
            {complianceResult.compliance_check_payments.map((item: ComplianceCheckPayment) => (
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

      <div className="card documents-card">
        <div className="card-header">
          <div>
            <h2 className="card-title">Документы сделки</h2>
            <p className="page-description" style={{ marginBottom: 0 }}>
              Загрузите подтверждающий документ по сделке и дождитесь появления в списке.
            </p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadDealDocuments()}
            disabled={documentsLoading}
            title="Обновить список документов"
          >
            {documentsLoading ? (
              <>
                <span className="spinner" />
                Обновление...
              </>
            ) : (
              'Обновить список'
            )}
          </button>
        </div>

        {beneficiaryLoading && (
          <div className="form-hint">Определяем beneficiary_id для сделки...</div>
        )}
        {beneficiaryError && (
          <div className="doc-error">
            <p>{beneficiaryError}</p>
          </div>
        )}

        {documentsLoading ? (
          <div className="doc-skeleton">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        ) : documentsError ? (
          <div className="doc-error">
            <p>{documentsError}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => loadDealDocuments()}>
              Повторить
            </button>
          </div>
        ) : dealDocuments.length > 0 ? (
          <div className="documents-list deal-documents-list">
            {dealDocuments.map((doc, index) => {
              const documentId = extractDocumentId(doc);
              const status = getDocumentStatus(doc);
              const typeLabel = doc.type ? (DEAL_DOCUMENT_TYPE_LABELS[doc.type] || doc.type) : 'Документ';
              const metaParts = [
                doc.document_number ? `№ ${doc.document_number}` : null,
                doc.document_date ? `от ${formatDateShort(doc.document_date)}` : null,
              ].filter(Boolean);
              return (
                <div key={documentId || index} className="document-item">
                  <div>
                    <div className="document-title">{typeLabel}</div>
                    {documentId && (
                      <div className="document-meta">
                        ID: <span className="code">{documentId}</span>
                      </div>
                    )}
                    {metaParts.length > 0 && (
                      <div className="document-meta">{metaParts.join(' ')}</div>
                    )}
                    {status.description ? (
                      <div className="document-meta document-description">{status.description}</div>
                    ) : null}
                  </div>
                  <span className={status.className}>{status.label}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="documents-empty">Документы по сделке пока не загружены.</div>
        )}

        <div className="deal-documents-upload">
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Тип документа *</label>
              <select
                className="form-input"
                value={documentType}
                onChange={(e) => {
                  setDocumentType(e.target.value);
                  setUploadMessage(null);
                }}
                disabled={uploadingDocument}
              >
                {DEAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Дата документа *</label>
              <input
                type="date"
                className="form-input"
                value={documentDate}
                onChange={(e) => {
                  setDocumentDate(e.target.value);
                  setUploadMessage(null);
                }}
                disabled={uploadingDocument}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Номер документа *</label>
            <input
              type="text"
              className="form-input"
              value={documentNumber}
              onChange={(e) => {
                setDocumentNumber(e.target.value);
                setUploadMessage(null);
              }}
              disabled={uploadingDocument}
              placeholder="Например, SA-2024-01"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Файл *</label>
            <input
              type="file"
              className="form-input"
              accept={DEAL_DOCUMENT_ACCEPT}
              onChange={(e) => handleDocumentFileChange(e.target.files?.[0] || null)}
              disabled={uploadingDocument}
            />
            {documentFile && (
              <div className="file-info">
                <div>Файл: {documentFile.name}</div>
                <div>Размер: {formatFileSize(documentFile.size)}</div>
                <div>Content-Type: {resolveDocumentMimeType(documentFile) || '—'}</div>
              </div>
            )}
            {documentFileError && <span className="form-error">{documentFileError}</span>}
            <span className="form-hint">
              Допустимые форматы: PDF, GIF, JPG, PNG, TIFF, BMP. Максимум {Math.round(MAX_DEAL_DOCUMENT_SIZE_BYTES / (1024 * 1024))} МБ.
            </span>
          </div>

          {uploadMessage && (
            <div className="form-hint" style={{ marginTop: 8 }}>
              {uploadMessage}
            </div>
          )}

          {pendingDocumentId && pollingStatus === 'checking' && (
            <div className="form-hint">
              Проверяем появление документа... (ID: {pendingDocumentId})
            </div>
          )}
          {pendingDocumentId && pollingStatus === 'timeout' && (
            <div className="doc-pending">
              <span>Документ принят, но ещё обрабатывается. Обновите позже.</span>
              <button className="btn btn-secondary btn-sm" onClick={checkPendingDocumentNow}>
                Проверить сейчас
              </button>
            </div>
          )}

          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleDealDocumentUpload}
              disabled={
                uploadingDocument ||
                beneficiaryLoading ||
                !beneficiaryId ||
                !documentDate ||
                !documentNumber.trim() ||
                !documentFile ||
                !!documentFileError
              }
            >
              {uploadingDocument ? (
                <>
                  <span className="spinner" />
                  Загрузка...
                </>
              ) : (
                'Загрузить документ'
              )}
            </button>
          </div>
        </div>
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

        .compliance-clickable {
          cursor: pointer;
          border: none;
        }

        .compliance-clickable:hover {
          filter: brightness(0.98);
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

        .documents-card .card-header {
          align-items: flex-start;
          gap: 16px;
        }

        .doc-skeleton {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
        }

        .doc-skeleton .skeleton-line {
          height: 12px;
          background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 6px;
          width: 60%;
        }

        .doc-skeleton .skeleton-line.short {
          width: 40%;
        }

        .doc-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          background: var(--color-error-bg);
          color: var(--color-error);
          border-radius: 10px;
          font-size: 13px;
          margin-bottom: 12px;
        }

        .documents-empty {
          font-size: 13px;
          color: var(--text-tertiary);
          padding: 4px 0 12px;
        }

        .deal-documents-list {
          margin-bottom: 16px;
        }

        .deal-documents-upload {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 12px;
        }

        .file-info {
          margin-top: 6px;
          font-size: 12px;
          color: var(--text-tertiary);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .doc-pending {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border-radius: 10px;
          font-size: 12px;
          color: var(--text-secondary);
          margin-top: 8px;
        }

        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
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

        .compliance-detail-empty {
          font-size: 12px;
          color: var(--text-tertiary);
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

          .documents-card .card-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .doc-pending {
            flex-direction: column;
            align-items: flex-start;
          }

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
