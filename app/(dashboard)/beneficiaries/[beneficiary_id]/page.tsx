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
  ogrn?: string;
  ogrnip?: string;
  birth_date?: string;
  birth_place?: string;
  passport_series?: string;
  passport_number?: string;
  passport_date?: string;
  registration_address?: string;
  tax_resident?: boolean;
  is_active_activity?: boolean;
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

interface ContractOfferDocument {
  document_id: string;
  document_number?: string;
  document_date?: string;
  success_added?: boolean;
  success_added_desc?: string;
}

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
  ogrn: (b as Record<string, unknown>).ogrn as string | undefined || b.beneficiary_data?.ogrn,
  ogrnip: (b as Record<string, unknown>).ogrnip as string | undefined || b.beneficiary_data?.ogrnip,
  birth_date: (b as Record<string, unknown>).birth_date as string | undefined || b.beneficiary_data?.birth_date,
  birth_place: (b as Record<string, unknown>).birth_place as string | undefined || b.beneficiary_data?.birth_place,
  passport_series: (b as Record<string, unknown>).passport_series as string | undefined || b.beneficiary_data?.passport_series,
  passport_number: (b as Record<string, unknown>).passport_number as string | undefined || b.beneficiary_data?.passport_number,
  passport_date: (b as Record<string, unknown>).passport_date as string | undefined || b.beneficiary_data?.passport_date,
  registration_address: (b as Record<string, unknown>).registration_address as string | undefined
    || b.beneficiary_data?.registration_address,
  tax_resident: (b as Record<string, unknown>).tax_resident as boolean | undefined
    ?? b.beneficiary_data?.tax_resident,
  is_active_activity: (b as Record<string, unknown>).is_active_activity as boolean | undefined
    ?? b.beneficiary_data?.is_active_activity,
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

export default function BeneficiaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const beneficiary_id = params.beneficiary_id as string;

  const layer = useAppStore((s) => s.layer);
  const addRecentAction = useAppStore((s) => s.addRecentAction);
  const {
    getBeneficiary,
    addBeneficiaryDocumentsData,
    updateBeneficiaryUL,
    updateBeneficiaryIP,
    updateBeneficiaryFL,
    listDocuments,
    getDocument,
    uploadDocumentBeneficiary,
  } = useCyclops({ layer });

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

  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({});
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const updateInitializedFor = useRef<string | null>(null);

  const [ulUpdate, setUlUpdate] = useState({
    name: '',
    kpp: '',
    ogrn: '',
    is_active_activity: true,
  });

  const [ipUpdate, setIpUpdate] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    tax_resident: true,
  });

  const [flUpdate, setFlUpdate] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    birth_date: '',
    birth_place: '',
    passport_series: '',
    passport_number: '',
    passport_date: '',
    registration_address: '',
    tax_resident: true,
  });

  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  const [isDocsSubmitting, setIsDocsSubmitting] = useState(false);
  const [docsMessage, setDocsMessage] = useState<string | null>(null);

  const [offerDocument, setOfferDocument] = useState<ContractOfferDocument | null>(null);
  const [isOfferDocumentLoading, setIsOfferDocumentLoading] = useState(true);
  const [offerDocumentError, setOfferDocumentError] = useState<string | null>(null);
  const [offerFile, setOfferFile] = useState<File | null>(null);
  const [offerFileError, setOfferFileError] = useState<string | null>(null);
  const [offerUploadMessage, setOfferUploadMessage] = useState<string | null>(null);
  const [isOfferUploading, setIsOfferUploading] = useState(false);
  const [offerUploadEnabled, setOfferUploadEnabled] = useState(false);
  const [isOfferStatusRefreshing, setIsOfferStatusRefreshing] = useState(false);
  const [offerMeta, setOfferMeta] = useState({
    document_number: '',
    document_date: '',
  });
  const offerDocumentRef = useRef<ContractOfferDocument | null>(null);

  const [passportDoc, setPassportDoc] = useState({
    series: '',
    number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    birth_date: '',
    issuer_code: '',
    issue_date: '',
  });

  const [innDoc, setInnDoc] = useState({
    inn: '',
    birth_place: '',
  });

  const birthPlaceRegex = /^(?!.*[IVX]{5,})[-. ,А-Яа-яёЁ0-9\)\(IVX"\/\\№]+$/;

  const digitsOnly = (value: string) => value.replace(/\D+/g, '');
  const minAddressLength = 15;
  const maxOfferFileSize = 10 * 1024 * 1024;
  const offerMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
  const offerExtensions = new Set(['pdf', 'png', 'jpg', 'jpeg']);
  const offerStatusRefreshWindowMs = 5 * 60 * 1000;
  const offerStatusChecksRef = useRef(new Map<string, number>());

  const formatDateSafe = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
  };

  const getFileExtension = (name: string) => {
    const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  };

  const validateOfferFile = (file: File) => {
    if (!file) return 'Выберите файл';
    if (file.size > maxOfferFileSize) {
      return 'Размер файла не должен превышать 10 МБ';
    }
    const extension = getFileExtension(file.name);
    if (!offerExtensions.has(extension) && !offerMimeTypes.has(file.type)) {
      return 'Допустимые форматы: PDF, PNG, JPG';
    }
    return null;
  };

  const extractDocumentId = (record?: Record<string, unknown> | null) => {
    if (!record) return '';
    const raw = record.document_id ?? record.id;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number') return String(raw);
    return '';
  };

  const formatRemainingMs = (ms: number) => {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes <= 0) return `${seconds} сек.`;
    return seconds > 0 ? `${minutes} мин. ${seconds} сек.` : `${minutes} мин.`;
  };

  const canRefreshOfferStatus = useCallback((documentId: string, force?: boolean) => {
    if (force) return true;
    const lastChecked = offerStatusChecksRef.current.get(documentId);
    if (!lastChecked) return true;
    return Date.now() - lastChecked >= offerStatusRefreshWindowMs;
  }, [offerStatusRefreshWindowMs]);

  const clearDocError = (field: string) => {
    setDocErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const clearUpdateError = (field: string) => {
    setUpdateErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateDigits = (value: string, length: number) =>
    new RegExp(`^\\d{${length}}$`).test(digitsOnly(value));

  const validateOptionalDigits = (value: string, length: number) =>
    !value || validateDigits(value, length);

  const validateUpdateForm = () => {
    const errors: Record<string, string> = {};

    if (!beneficiary) {
      setUpdateErrors(errors);
      return false;
    }

    if (beneficiary.type === 'ul') {
      if (!ulUpdate.name.trim()) {
        errors.ul_name = 'Укажите наименование';
      }
      if (!validateDigits(ulUpdate.kpp, 9)) {
        errors.ul_kpp = 'КПП должен содержать 9 цифр';
      }
      if (!validateOptionalDigits(ulUpdate.ogrn, 15)) {
        errors.ul_ogrn = 'ОГРН должен содержать 15 цифр';
      }
    }

    if (beneficiary.type === 'ip') {
      if (!ipUpdate.first_name.trim()) {
        errors.ip_first_name = 'Укажите имя';
      }
      if (!ipUpdate.last_name.trim()) {
        errors.ip_last_name = 'Укажите фамилию';
      }
    }

    if (beneficiary.type === 'fl') {
      if (!flUpdate.first_name.trim()) {
        errors.fl_first_name = 'Укажите имя';
      }
      if (!flUpdate.last_name.trim()) {
        errors.fl_last_name = 'Укажите фамилию';
      }
      if (!flUpdate.birth_date) {
        errors.fl_birth_date = 'Укажите дату рождения';
      }
      if (!flUpdate.birth_place.trim() || !birthPlaceRegex.test(flUpdate.birth_place.trim())) {
        errors.fl_birth_place = 'Недопустимый формат места рождения';
      }
      if (!validateDigits(flUpdate.passport_series, 4)) {
        errors.fl_passport_series = 'Серия паспорта: 4 цифры';
      }
      if (!validateDigits(flUpdate.passport_number, 6)) {
        errors.fl_passport_number = 'Номер паспорта: 6 цифр';
      }
      if (!flUpdate.passport_date) {
        errors.fl_passport_date = 'Укажите дату выдачи';
      }
      if (!flUpdate.registration_address.trim()) {
        errors.fl_registration_address = 'Укажите адрес регистрации';
      } else if (flUpdate.registration_address.trim().length < minAddressLength) {
        errors.fl_registration_address = `Адрес должен быть не короче ${minAddressLength} символов`;
      }
    }

    setUpdateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const applyBeneficiaryToUpdateForm = useCallback((target: Beneficiary) => {
    setUlUpdate({
      name: target.name || '',
      kpp: target.kpp || '',
      ogrn: target.ogrn || '',
      is_active_activity: target.is_active_activity ?? true,
    });
    setIpUpdate({
      first_name: target.first_name || '',
      middle_name: target.middle_name || '',
      last_name: target.last_name || '',
      tax_resident: target.tax_resident ?? true,
    });
    setFlUpdate({
      first_name: target.first_name || '',
      middle_name: target.middle_name || '',
      last_name: target.last_name || '',
      birth_date: target.birth_date || '',
      birth_place: target.birth_place || '',
      passport_series: target.passport_series || '',
      passport_number: target.passport_number || '',
      passport_date: target.passport_date || '',
      registration_address: target.registration_address || '',
      tax_resident: target.tax_resident ?? true,
    });
  }, []);

  const validateDocuments = () => {
    const errors: Record<string, string> = {};

    if (!/^\d{4}$/.test(passportDoc.series)) {
      errors.passport_series = 'Серия паспорта: 4 цифры';
    }
    if (!/^\d{6}$/.test(passportDoc.number)) {
      errors.passport_number = 'Номер паспорта: 6 цифр';
    }
    if (!passportDoc.first_name.trim()) {
      errors.passport_first_name = 'Укажите имя';
    }
    if (!passportDoc.last_name.trim()) {
      errors.passport_last_name = 'Укажите фамилию';
    }
    if (!passportDoc.birth_date) {
      errors.passport_birth_date = 'Укажите дату рождения';
    }
    if (!/^\d{3,6}$/.test(passportDoc.issuer_code)) {
      errors.passport_issuer_code = 'Код подразделения: 3–6 цифр';
    }
    if (!passportDoc.issue_date) {
      errors.passport_issue_date = 'Укажите дату выдачи';
    }

    if (!/^\d{12}$/.test(innDoc.inn)) {
      errors.inn_value = 'ИНН должен содержать 12 цифр';
    }
    if (!innDoc.birth_place.trim() || !birthPlaceRegex.test(innDoc.birth_place.trim())) {
      errors.inn_birth_place = 'Недопустимый формат места рождения';
    }

    setDocErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildOfferDocument = (
    documentId: string,
    detailRecord?: Record<string, unknown> | null,
    listRecord?: Record<string, unknown> | null
  ): ContractOfferDocument => {
    const detail = detailRecord || {};
    const list = listRecord || {};
    const document_number = typeof detail.document_number === 'string'
      ? detail.document_number
      : typeof list.document_number === 'string'
        ? list.document_number
        : undefined;
    const document_date = typeof detail.document_date === 'string'
      ? detail.document_date
      : typeof list.document_date === 'string'
        ? list.document_date
        : undefined;
    const success_added = typeof detail.success_added === 'boolean'
      ? detail.success_added
      : typeof list.success_added === 'boolean'
        ? list.success_added
        : undefined;
    const success_added_desc = typeof detail.success_added_desc === 'string'
      ? detail.success_added_desc
      : typeof list.success_added_desc === 'string'
        ? list.success_added_desc
        : undefined;

    return {
      document_id: documentId,
      document_number,
      document_date,
      success_added,
      success_added_desc,
    };
  };

  const loadOfferDocument = useCallback(async (options?: { silent?: boolean; force?: boolean }) => {
    if (inFlight.current.has('contract_offer')) return;
    inFlight.current.add('contract_offer');
    if (!beneficiary_id || beneficiary_id === 'undefined') {
      setIsOfferDocumentLoading(false);
      inFlight.current.delete('contract_offer');
      return;
    }
    if (!options?.silent) {
      setIsOfferDocumentLoading(true);
    }
    setOfferDocumentError(null);

    try {
      const response = await listDocuments({
        page: 1,
        per_page: 100,
        filters: {
          beneficiary: { id: beneficiary_id },
          type: 'contract_offer',
        },
      });
      const listResult = response.result?.documents ?? response.result;
      const list = Array.isArray(listResult) ? listResult : [];
      const first = list.length > 0 ? list[0] : null;
      const listRecord = first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
      const documentId = typeof first === 'string' ? first : extractDocumentId(listRecord);

      const currentOffer = offerDocumentRef.current;
      if (!documentId) {
        if (!currentOffer) {
          setOfferDocument(null);
          setOfferUploadEnabled(true);
        } else {
          setOfferUploadEnabled(false);
        }
        return;
      }

      if (!canRefreshOfferStatus(documentId, options?.force)) {
        if (!currentOffer || currentOffer.document_id !== documentId) {
          setOfferDocument(buildOfferDocument(documentId, null, listRecord));
        }
        setOfferUploadEnabled(false);
        return;
      }

      const detailsResponse = await getDocument(documentId);
      const detailsPayload = (detailsResponse.result as { document?: unknown } | undefined)?.document ?? detailsResponse.result;
      const detailRecord = detailsPayload && typeof detailsPayload === 'object'
        ? (detailsPayload as Record<string, unknown>)
        : null;
      setOfferDocument(buildOfferDocument(documentId, detailRecord, listRecord));
      offerStatusChecksRef.current.set(documentId, Date.now());
      setOfferUploadEnabled(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить документы';
      setOfferDocumentError(message);
    } finally {
      setIsOfferDocumentLoading(false);
      inFlight.current.delete('contract_offer');
    }
  }, [beneficiary_id, listDocuments, getDocument, canRefreshOfferStatus]);

  const refreshOfferStatus = useCallback(async () => {
    if (!offerDocument?.document_id) {
      await loadOfferDocument({ silent: true, force: true });
      return;
    }
    if (!canRefreshOfferStatus(offerDocument.document_id)) {
      return;
    }
    if (inFlight.current.has('contract_offer_status')) return;
    inFlight.current.add('contract_offer_status');
    setIsOfferStatusRefreshing(true);
    setOfferDocumentError(null);
    try {
      const detailsResponse = await getDocument(offerDocument.document_id);
      const detailsPayload = (detailsResponse.result as { document?: unknown } | undefined)?.document ?? detailsResponse.result;
      const detailRecord = detailsPayload && typeof detailsPayload === 'object'
        ? (detailsPayload as Record<string, unknown>)
        : null;
      setOfferDocument((prev) => prev ? buildOfferDocument(prev.document_id, detailRecord, null) : null);
      offerStatusChecksRef.current.set(offerDocument.document_id, Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обновить статус';
      setOfferDocumentError(message);
    } finally {
      setIsOfferStatusRefreshing(false);
      inFlight.current.delete('contract_offer_status');
    }
  }, [offerDocument, getDocument, loadOfferDocument, canRefreshOfferStatus]);

  const handleOfferFileChange = (file: File | null) => {
    setOfferFile(file);
    setOfferUploadMessage(null);
    const validationError = file ? validateOfferFile(file) : null;
    setOfferFileError(validationError);
  };

  const handleOfferUpload = async () => {
    if (!beneficiary_id || beneficiary_id === 'undefined') return;
    if (!offerUploadEnabled) {
      setOfferFileError('Загрузка недоступна, используйте кнопку "Загрузить новую версию"');
      return;
    }
    setOfferUploadMessage(null);

    if (!offerFile) {
      setOfferFileError('Выберите файл');
      return;
    }
    const validationError = validateOfferFile(offerFile);
    if (validationError) {
      setOfferFileError(validationError);
      return;
    }

    setIsOfferUploading(true);
    try {
      const result = await uploadDocumentBeneficiary({
        beneficiary_id,
        document_type: 'contract_offer',
        file: offerFile,
        document_date: offerMeta.document_date || undefined,
        document_number: offerMeta.document_number || undefined,
      });

      const documentId = typeof result?.document_id === 'string'
        ? result.document_id
        : typeof (result as { id?: unknown } | undefined)?.id === 'string'
          ? (result as { id?: string }).id!
          : '';
      const successAdded = typeof result?.success_added === 'boolean' ? result.success_added : undefined;
      const successDesc = typeof result?.success_added_desc === 'string' ? result.success_added_desc : undefined;
      const baseMessage = successAdded === false
        ? 'Документ отправлен в обработку'
        : 'Документ загружен';
      setOfferUploadMessage(successDesc ? `${baseMessage}. ${successDesc}` : baseMessage);
      setOfferUploadEnabled(false);
      setOfferFile(null);
      setOfferFileError(null);

      if (documentId) {
        setOfferDocument({
          document_id: documentId,
          success_added: successAdded,
          success_added_desc: successDesc,
        });
      }

      window.setTimeout(() => {
        loadOfferDocument({ silent: true });
      }, 1500);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка при загрузке документа';
      setOfferUploadMessage(message);
    } finally {
      setIsOfferUploading(false);
    }
  };

  const handleDocumentsSubmit = async () => {
    if (!beneficiary_id || beneficiary_id === 'undefined') return;
    setDocsMessage(null);
    if (!validateDocuments()) return;

    setIsDocsSubmitting(true);
    try {
      await addBeneficiaryDocumentsData({
        beneficiary_id,
        documents: [
          {
            type: 'inn_f',
            inn: innDoc.inn,
            birth_place: innDoc.birth_place,
          },
          {
            type: 'internal_passport',
            series: passportDoc.series,
            number: passportDoc.number,
            first_name: passportDoc.first_name,
            middle_name: passportDoc.middle_name || undefined,
            last_name: passportDoc.last_name,
            birth_date: passportDoc.birth_date,
            issuer_code: passportDoc.issuer_code,
            issue_date: passportDoc.issue_date,
          },
        ],
      });
      setDocsMessage('Документы отправлены на проверку');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка при сохранении документов';
      setDocsMessage(message);
    } finally {
      setIsDocsSubmitting(false);
    }
  };

  const handleUpdateSubmit = async () => {
    if (!beneficiary || !beneficiary_id || beneficiary_id === 'undefined') return;
    setUpdateMessage(null);
    if (!validateUpdateForm()) return;

    setIsUpdating(true);
    try {
      let response;

      if (beneficiary.type === 'ul') {
        response = await updateBeneficiaryUL({
          beneficiary_id,
          beneficiary_data: {
            name: ulUpdate.name,
            kpp: ulUpdate.kpp,
            ogrn: ulUpdate.ogrn || undefined,
            is_active_activity: ulUpdate.is_active_activity,
          },
        });
      } else if (beneficiary.type === 'ip') {
        response = await updateBeneficiaryIP({
          beneficiary_id,
          beneficiary_data: {
            first_name: ipUpdate.first_name,
            middle_name: ipUpdate.middle_name || undefined,
            last_name: ipUpdate.last_name,
            tax_resident: ipUpdate.tax_resident,
          },
        });
      } else {
        response = await updateBeneficiaryFL({
          beneficiary_id,
          beneficiary_data: {
            first_name: flUpdate.first_name,
            middle_name: flUpdate.middle_name || undefined,
            last_name: flUpdate.last_name,
            birth_date: flUpdate.birth_date,
            birth_place: flUpdate.birth_place,
            passport_series: flUpdate.passport_series,
            passport_number: flUpdate.passport_number,
            passport_date: flUpdate.passport_date,
            registration_address: flUpdate.registration_address,
            tax_resident: flUpdate.tax_resident,
          },
        });
      }

      if (response?.error) {
        throw new Error(response.error.message);
      }

      setUpdateMessage('Данные бенефициара обновлены');
      setIsEditing(false);
      addRecentAction({
        type: 'Обновление бенефициара',
        description: `Обновлены данные ${getBeneficiaryName()}`,
        layer,
      });
      await loadBeneficiary();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка при обновлении';
      setUpdateMessage(message);
    } finally {
      setIsUpdating(false);
    }
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
    } catch (error) {
      console.error('Failed to load beneficiary:', error);
    } finally {
      setIsLoading(false);
      inFlight.current.delete('beneficiary');
    }
  }, [getBeneficiary, beneficiary_id]);

  const handleEditStart = () => {
    setUpdateMessage(null);
    setUpdateErrors({});
    setIsEditing(true);
  };

  const handleEditCancel = () => {
    if (beneficiary) {
      applyBeneficiaryToUpdateForm(beneficiary);
    }
    setUpdateMessage(null);
    setUpdateErrors({});
    setIsEditing(false);
  };

  useEffect(() => {
    offerDocumentRef.current = offerDocument;
  }, [offerDocument]);

  useEffect(() => {
    if (!beneficiary) return;
    if (updateInitializedFor.current === beneficiary.beneficiary_id) return;

    updateInitializedFor.current = beneficiary.beneficiary_id;
    setUpdateErrors({});
    setUpdateMessage(null);
    setIsEditing(false);
    applyBeneficiaryToUpdateForm(beneficiary);
  }, [applyBeneficiaryToUpdateForm, beneficiary]);

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
    loadOfferDocument();
    loadMachines();
    loadAvailableMachines();
  }, [loadBeneficiary, loadOfferDocument, loadMachines, loadAvailableMachines]);

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

  const offerStatus = offerDocument
    ? offerDocument.success_added === false
      ? { label: 'В обработке', className: 'badge-warning' }
      : { label: 'Загружен', className: 'badge-success' }
    : { label: 'Не загружен', className: 'badge-neutral' };
  const offerMetaLabel = [
    offerDocument?.document_number ? `№ ${offerDocument.document_number}` : null,
    offerDocument?.document_date ? `от ${formatDateSafe(offerDocument.document_date)}` : null,
  ].filter(Boolean).join(' ');
  const offerRefreshRemainingMs = offerDocument?.document_id
    ? Math.max(
      0,
      offerStatusRefreshWindowMs - (Date.now() - (offerStatusChecksRef.current.get(offerDocument.document_id) || 0))
    )
    : 0;

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
        <>
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

          <div className="card documents-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Документы</h2>
                <p className="page-description" style={{ marginBottom: 0 }}>
                  Для идентификации платежей нужен договор оферты.
                </p>
              </div>
              {offerDocument && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={refreshOfferStatus}
                  disabled={isOfferStatusRefreshing || offerRefreshRemainingMs > 0}
                  title={offerRefreshRemainingMs > 0
                    ? `Доступно через ${formatRemainingMs(offerRefreshRemainingMs)}`
                    : 'Обновить статус'}
                >
                  {isOfferStatusRefreshing ? (
                    <>
                      <span className="spinner" />
                      Обновление...
                    </>
                  ) : (
                    'Обновить статус'
                  )}
                </button>
              )}
            </div>

            {isOfferDocumentLoading ? (
              <div className="doc-skeleton">
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
              </div>
            ) : offerDocumentError ? (
              <div className="doc-error">
                <p>Не удалось получить документы</p>
                <button className="btn btn-secondary btn-sm" onClick={() => loadOfferDocument()}>
                  Повторить
                </button>
              </div>
            ) : (
              <>
                <div className="offer-document-row">
                  <div className="offer-document-main">
                    <div className="offer-document-title">Договор оферты</div>
                    <div className="offer-document-meta">
                      <span className={`badge ${offerStatus.className}`}>{offerStatus.label}</span>
                      {offerMetaLabel && <span className="offer-document-meta-text">{offerMetaLabel}</span>}
                    </div>
                    {!offerDocument && (
                      <div className="offer-document-empty">Документ не загружен</div>
                    )}
                    {offerDocument?.success_added_desc && (
                      <div className="offer-document-desc" title={offerDocument.success_added_desc}>
                        {offerDocument.success_added_desc}
                      </div>
                    )}
                    {offerDocument?.document_id && offerRefreshRemainingMs > 0 && (
                      <div className="offer-document-desc">
                        Обновление доступно через {formatRemainingMs(offerRefreshRemainingMs)}.
                      </div>
                    )}
                  </div>
                </div>

                <div className="offer-upload">
                  <div className="form-row form-row-2">
                    <div className="form-group">
                      <label className="form-label">Номер документа (опционально)</label>
                      <input
                        type="text"
                        className="form-input"
                        value={offerMeta.document_number}
                        onChange={(e) => setOfferMeta({ ...offerMeta, document_number: e.target.value })}
                        disabled={!offerUploadEnabled}
                        placeholder="Например, 1101"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Дата документа (опционально)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={offerMeta.document_date}
                        onChange={(e) => setOfferMeta({ ...offerMeta, document_date: e.target.value })}
                        disabled={!offerUploadEnabled}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Файл</label>
                    <input
                      type="file"
                      className="form-input"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={(e) => handleOfferFileChange(e.target.files?.[0] || null)}
                      disabled={!offerUploadEnabled}
                    />
                    {offerFile && <div className="file-name">{offerFile.name}</div>}
                    {offerFileError && <span className="form-error">{offerFileError}</span>}
                    <span className="form-hint">Подписанный договор оферты</span>
                  </div>

                  {offerUploadMessage && (
                    <div className="form-hint" style={{ marginTop: 8 }}>
                      {offerUploadMessage}
                    </div>
                  )}

                  <div className="form-actions offer-actions">
                    {offerDocument && !offerUploadEnabled && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setOfferUploadEnabled(true);
                          setOfferFile(null);
                          setOfferFileError(null);
                          setOfferUploadMessage(null);
                        }}
                      >
                        Загрузить новую версию
                      </button>
                    )}
                    {offerDocument && offerUploadEnabled && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setOfferUploadEnabled(false);
                          setOfferFile(null);
                          setOfferFileError(null);
                          setOfferUploadMessage(null);
                        }}
                      >
                        Отмена
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={handleOfferUpload}
                      disabled={!offerUploadEnabled || isOfferUploading || !offerFile || !!offerFileError}
                    >
                      {isOfferUploading ? (
                        <>
                          <span className="spinner" />
                          Загрузка...
                        </>
                      ) : offerDocument ? (
                        'Загрузить новую версию'
                      ) : (
                        'Загрузить договор оферты'
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card update-card">
            <h2 className="card-title">Обновить данные</h2>

            {beneficiary.type === 'ul' && (
              <div className="form-fields">
                <div className="form-group">
                  <label className="form-label">Полное наименование *</label>
                  <input
                    type="text"
                    className={`form-input ${isEditing && updateErrors.ul_name ? 'input-error' : ''}`}
                    disabled={!isEditing}
                    value={ulUpdate.name}
                    onChange={(e) => {
                      setUlUpdate({ ...ulUpdate, name: e.target.value });
                      clearUpdateError('ul_name');
                    }}
                  />
                  {isEditing && updateErrors.ul_name && <span className="form-error">{updateErrors.ul_name}</span>}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">КПП *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.ul_kpp ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      maxLength={9}
                      value={ulUpdate.kpp}
                      onChange={(e) => {
                        setUlUpdate({ ...ulUpdate, kpp: digitsOnly(e.target.value).slice(0, 9) });
                        clearUpdateError('ul_kpp');
                      }}
                    />
                    {isEditing && updateErrors.ul_kpp && <span className="form-error">{updateErrors.ul_kpp}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">ОГРН</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.ul_ogrn ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      maxLength={15}
                      value={ulUpdate.ogrn}
                      onChange={(e) => {
                        setUlUpdate({ ...ulUpdate, ogrn: digitsOnly(e.target.value).slice(0, 15) });
                        clearUpdateError('ul_ogrn');
                      }}
                    />
                    {isEditing && updateErrors.ul_ogrn && <span className="form-error">{updateErrors.ul_ogrn}</span>}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Основной доход от активной деятельности</label>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={ulUpdate.is_active_activity}
                      disabled={!isEditing}
                      onChange={(e) => setUlUpdate({ ...ulUpdate, is_active_activity: e.target.checked })}
                    />
                    <span>Более 50% доходов от активной деятельности</span>
                  </label>
                </div>
              </div>
            )}

            {beneficiary.type === 'ip' && (
              <div className="form-fields">
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Фамилия *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.ip_last_name ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={ipUpdate.last_name}
                      onChange={(e) => {
                        setIpUpdate({ ...ipUpdate, last_name: e.target.value });
                        clearUpdateError('ip_last_name');
                      }}
                    />
                    {isEditing && updateErrors.ip_last_name && (
                      <span className="form-error">{updateErrors.ip_last_name}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.ip_first_name ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={ipUpdate.first_name}
                      onChange={(e) => {
                        setIpUpdate({ ...ipUpdate, first_name: e.target.value });
                        clearUpdateError('ip_first_name');
                      }}
                    />
                    {isEditing && updateErrors.ip_first_name && (
                      <span className="form-error">{updateErrors.ip_first_name}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      disabled={!isEditing}
                      value={ipUpdate.middle_name}
                      onChange={(e) => setIpUpdate({ ...ipUpdate, middle_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Налоговый резидент РФ</label>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={ipUpdate.tax_resident}
                      disabled={!isEditing}
                      onChange={(e) => setIpUpdate({ ...ipUpdate, tax_resident: e.target.checked })}
                    />
                    <span>Является налоговым резидентом РФ</span>
                  </label>
                </div>
              </div>
            )}

            {beneficiary.type === 'fl' && (
              <div className="form-fields">
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Фамилия *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.fl_last_name ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={flUpdate.last_name}
                      onChange={(e) => {
                        setFlUpdate({ ...flUpdate, last_name: e.target.value });
                        clearUpdateError('fl_last_name');
                      }}
                    />
                    {isEditing && updateErrors.fl_last_name && (
                      <span className="form-error">{updateErrors.fl_last_name}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.fl_first_name ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={flUpdate.first_name}
                      onChange={(e) => {
                        setFlUpdate({ ...flUpdate, first_name: e.target.value });
                        clearUpdateError('fl_first_name');
                      }}
                    />
                    {isEditing && updateErrors.fl_first_name && (
                      <span className="form-error">{updateErrors.fl_first_name}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      disabled={!isEditing}
                      value={flUpdate.middle_name}
                      onChange={(e) => setFlUpdate({ ...flUpdate, middle_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Дата рождения *</label>
                    <input
                      type="date"
                      className={`form-input ${isEditing && updateErrors.fl_birth_date ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={flUpdate.birth_date}
                      onChange={(e) => {
                        setFlUpdate({ ...flUpdate, birth_date: e.target.value });
                        clearUpdateError('fl_birth_date');
                      }}
                    />
                    {isEditing && updateErrors.fl_birth_date && (
                      <span className="form-error">{updateErrors.fl_birth_date}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Место рождения *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.fl_birth_place ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={flUpdate.birth_place}
                      onChange={(e) => {
                        setFlUpdate({ ...flUpdate, birth_place: e.target.value });
                        clearUpdateError('fl_birth_place');
                      }}
                    />
                    {isEditing && updateErrors.fl_birth_place && (
                      <span className="form-error">{updateErrors.fl_birth_place}</span>
                    )}
                  </div>
                </div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Серия паспорта *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.fl_passport_series ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      maxLength={4}
                      value={flUpdate.passport_series}
                      onChange={(e) => {
                        setFlUpdate({
                          ...flUpdate,
                          passport_series: digitsOnly(e.target.value).slice(0, 4),
                        });
                        clearUpdateError('fl_passport_series');
                      }}
                    />
                    {isEditing && updateErrors.fl_passport_series && (
                      <span className="form-error">{updateErrors.fl_passport_series}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Номер паспорта *</label>
                    <input
                      type="text"
                      className={`form-input ${isEditing && updateErrors.fl_passport_number ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      maxLength={6}
                      value={flUpdate.passport_number}
                      onChange={(e) => {
                        setFlUpdate({
                          ...flUpdate,
                          passport_number: digitsOnly(e.target.value).slice(0, 6),
                        });
                        clearUpdateError('fl_passport_number');
                      }}
                    />
                    {isEditing && updateErrors.fl_passport_number && (
                      <span className="form-error">{updateErrors.fl_passport_number}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Дата выдачи *</label>
                    <input
                      type="date"
                      className={`form-input ${isEditing && updateErrors.fl_passport_date ? 'input-error' : ''}`}
                      disabled={!isEditing}
                      value={flUpdate.passport_date}
                      onChange={(e) => {
                        setFlUpdate({ ...flUpdate, passport_date: e.target.value });
                        clearUpdateError('fl_passport_date');
                      }}
                    />
                    {isEditing && updateErrors.fl_passport_date && (
                      <span className="form-error">{updateErrors.fl_passport_date}</span>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Адрес регистрации *</label>
                  <input
                    type="text"
                    className={`form-input ${isEditing && updateErrors.fl_registration_address ? 'input-error' : ''}`}
                    disabled={!isEditing}
                    value={flUpdate.registration_address}
                    onChange={(e) => {
                      setFlUpdate({ ...flUpdate, registration_address: e.target.value });
                      clearUpdateError('fl_registration_address');
                    }}
                  />
                  {isEditing && updateErrors.fl_registration_address && (
                    <span className="form-error">{updateErrors.fl_registration_address}</span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Налоговый резидент РФ</label>
                  <label className="form-checkbox">
                    <input
                      type="checkbox"
                      checked={flUpdate.tax_resident}
                      disabled={!isEditing}
                      onChange={(e) => setFlUpdate({ ...flUpdate, tax_resident: e.target.checked })}
                    />
                    <span>Является налоговым резидентом РФ</span>
                  </label>
                </div>
              </div>
            )}

            {updateMessage && (
              <div className="form-hint" style={{ marginTop: 8 }}>
                {updateMessage}
              </div>
            )}

            <div className="form-actions">
              {isEditing ? (
                <>
                  <button className="btn btn-secondary" onClick={handleEditCancel} disabled={isUpdating}>
                    Отмена
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleUpdateSubmit}
                    disabled={isUpdating}
                  >
                    {isUpdating ? (
                      <>
                        <span className="spinner" />
                        Сохранение...
                      </>
                    ) : (
                      'Сохранить изменения'
                    )}
                  </button>
                </>
              ) : (
                <button className="btn btn-secondary" onClick={handleEditStart}>
                  Редактировать
                </button>
              )}
            </div>
          </div>

          {(beneficiary.type === 'ip' || beneficiary.type === 'fl') && (
            <div className="card documents-card">
              <h2 className="card-title">Документы бенефициара</h2>
              <p className="page-description" style={{ marginBottom: 16 }}>
                Паспорт и ИНН используются для обновления данных бенефициара. Старые документы будут помечены как
                истёкшие через 7 дней после успешной валидации.
              </p>

              <div className="document-section">
                <h3 className="section-title">Паспорт РФ</h3>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Серия *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.passport_series ? 'input-error' : ''}`}
                      maxLength={4}
                      value={passportDoc.series}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, series: digitsOnly(e.target.value).slice(0, 4) });
                        clearDocError('passport_series');
                      }}
                    />
                    {docErrors.passport_series && <span className="form-error">{docErrors.passport_series}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Номер *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.passport_number ? 'input-error' : ''}`}
                      maxLength={6}
                      value={passportDoc.number}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, number: digitsOnly(e.target.value).slice(0, 6) });
                        clearDocError('passport_number');
                      }}
                    />
                    {docErrors.passport_number && <span className="form-error">{docErrors.passport_number}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Код подразделения *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.passport_issuer_code ? 'input-error' : ''}`}
                      maxLength={6}
                      value={passportDoc.issuer_code}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, issuer_code: digitsOnly(e.target.value).slice(0, 6) });
                        clearDocError('passport_issuer_code');
                      }}
                    />
                    {docErrors.passport_issuer_code && (
                      <span className="form-error">{docErrors.passport_issuer_code}</span>
                    )}
                  </div>
                </div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Фамилия *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.passport_last_name ? 'input-error' : ''}`}
                      value={passportDoc.last_name}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, last_name: e.target.value });
                        clearDocError('passport_last_name');
                      }}
                    />
                    {docErrors.passport_last_name && <span className="form-error">{docErrors.passport_last_name}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Имя *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.passport_first_name ? 'input-error' : ''}`}
                      value={passportDoc.first_name}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, first_name: e.target.value });
                        clearDocError('passport_first_name');
                      }}
                    />
                    {docErrors.passport_first_name && (
                      <span className="form-error">{docErrors.passport_first_name}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Отчество</label>
                    <input
                      type="text"
                      className="form-input"
                      value={passportDoc.middle_name}
                      onChange={(e) => setPassportDoc({ ...passportDoc, middle_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Дата рождения *</label>
                    <input
                      type="date"
                      className={`form-input ${docErrors.passport_birth_date ? 'input-error' : ''}`}
                      value={passportDoc.birth_date}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, birth_date: e.target.value });
                        clearDocError('passport_birth_date');
                      }}
                    />
                    {docErrors.passport_birth_date && (
                      <span className="form-error">{docErrors.passport_birth_date}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Дата выдачи *</label>
                    <input
                      type="date"
                      className={`form-input ${docErrors.passport_issue_date ? 'input-error' : ''}`}
                      value={passportDoc.issue_date}
                      onChange={(e) => {
                        setPassportDoc({ ...passportDoc, issue_date: e.target.value });
                        clearDocError('passport_issue_date');
                      }}
                    />
                    {docErrors.passport_issue_date && (
                      <span className="form-error">{docErrors.passport_issue_date}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="document-section">
                <h3 className="section-title">ИНН</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">ИНН *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.inn_value ? 'input-error' : ''}`}
                      maxLength={12}
                      value={innDoc.inn}
                      onChange={(e) => {
                        setInnDoc({ ...innDoc, inn: digitsOnly(e.target.value).slice(0, 12) });
                        clearDocError('inn_value');
                      }}
                    />
                    {docErrors.inn_value && <span className="form-error">{docErrors.inn_value}</span>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Место рождения *</label>
                    <input
                      type="text"
                      className={`form-input ${docErrors.inn_birth_place ? 'input-error' : ''}`}
                      value={innDoc.birth_place}
                      onChange={(e) => {
                        setInnDoc({ ...innDoc, birth_place: e.target.value });
                        clearDocError('inn_birth_place');
                      }}
                    />
                    {docErrors.inn_birth_place && (
                      <span className="form-error">{docErrors.inn_birth_place}</span>
                    )}
                  </div>
                </div>
              </div>

              {docsMessage && (
                <div className="form-hint" style={{ marginTop: 8 }}>
                  {docsMessage}
                </div>
              )}

              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleDocumentsSubmit}
                  disabled={isDocsSubmitting}
                >
                  {isDocsSubmitting ? (
                    <>
                      <span className="spinner" />
                      Сохранение...
                    </>
                  ) : (
                    'Сохранить документы'
                  )}
                </button>
              </div>
            </div>
          )}
        </>
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

        .documents-card {
          margin-top: 24px;
        }

        .update-card {
          margin-top: 24px;
        }

        .offer-document-row {
          padding: 8px 0 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .offer-document-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .offer-document-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }

        .offer-document-meta-text {
          font-size: 13px;
          color: var(--text-secondary);
        }

        .offer-document-empty {
          margin-top: 8px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .offer-document-desc {
          margin-top: 8px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .offer-upload {
          padding-top: 16px;
        }

        .offer-actions {
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .file-name {
          margin-top: 6px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .doc-skeleton {
          padding: 24px 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .skeleton-line {
          height: 12px;
          border-radius: 6px;
          background: linear-gradient(
            90deg,
            var(--bg-tertiary) 0%,
            rgba(255, 255, 255, 0.35) 50%,
            var(--bg-tertiary) 100%
          );
          background-size: 200% 100%;
          animation: shimmer 1.4s ease-in-out infinite;
        }

        .skeleton-line.short {
          width: 60%;
        }

        .doc-error {
          padding: 16px;
          background: var(--color-error-bg, rgba(239, 68, 68, 0.1));
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .doc-error p {
          margin: 0;
          color: var(--color-error, #ef4444);
          font-size: 14px;
        }

        @keyframes shimmer {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }

        .document-section {
          padding: 16px 0;
          border-top: 1px solid var(--border-color);
        }

        .document-section:first-of-type {
          border-top: none;
          padding-top: 0;
        }

        .section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }

        .form-row-3 {
          grid-template-columns: repeat(3, 1fr);
        }

        .form-row-2 {
          grid-template-columns: repeat(2, 1fr);
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
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

          .form-row-3 {
            grid-template-columns: 1fr;
          }

          .form-row-2 {
            grid-template-columns: 1fr;
          }

          .form-actions {
            justify-content: stretch;
          }

          .form-actions .btn {
            width: 100%;
          }

          .offer-actions {
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
}
