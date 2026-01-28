'use client';

import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { 
  buildCreateBeneficiaryIpParams,
  buildCreateBeneficiaryFlParams,
  buildUpdateBeneficiaryUlParams,
  buildUpdateBeneficiaryIpParams,
  buildUpdateBeneficiaryFlParams,
  type CreateBeneficiaryIpInput,
  type CreateBeneficiaryFlInput,
  type UpdateBeneficiaryUlInput,
  type UpdateBeneficiaryIpInput,
  type UpdateBeneficiaryFlInput,
} from '@/lib/beneficiary-requests';
import type {
  Layer,
  JsonRpcResponse,
  ListBeneficiariesResult,
  GetBeneficiaryResult,
  ListVirtualAccountsResult,
  GetVirtualAccountResult,
  ListVirtualTransactionsResult,
  RefundVirtualAccountResult,
  TransferBetweenAccountsResult,
  TransferBetweenAccountsV2Result,
  GetVirtualAccountsTransferResult,
  OperationType,
  AddBeneficiaryDocumentsParams,
  AddBeneficiaryDocumentsResult,
  UpdateBeneficiaryResult,
  // Payment types
  ListPaymentsV2Params,
  ListPaymentsV2Result,
  GetPaymentResult,
  IdentifyPaymentParams,
  IdentifyPaymentResult,
  PaymentFilters,
  ListDocumentsResult,
  GetDocumentResult,
  UploadDocumentResult,
} from '@/types/cyclops';

interface UseCyclopsOptions {
  layer: Layer;
}

interface CacheInfo {
  cached: boolean;
  cachedAt?: string;
  expiresAt?: string;
  remainingMs?: number;
  nextAllowedAt?: string;
  cacheAgeSeconds?: number;
}

interface ErrorInfo {
  userMessage: string;
  isRetryable: boolean;
  isIdempotentInProcess: boolean;
}

interface CyclopsState {
  loading: boolean;
  error: string | null;
  errorInfo: ErrorInfo | null;
  cacheInfo: CacheInfo | null;
}

// Глобальный кеш и дедупликация на клиенте
const CACHE_TTL_MS = 5 * 60 * 1000;
const requestCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<JsonRpcResponse<unknown>>;
  }
>();

// Хранилище ext_key для идемпотентных операций (per session)
const idempotencyKeys = new Map<string, string>();

const clearCacheByPrefix = (prefix: string) => {
  Array.from(requestCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      requestCache.delete(key);
    }
  });
};

/**
 * Генерирует или возвращает существующий ext_key для идемпотентной операции
 */
function getOrCreateExtKey(operationKey: string): string {
  let extKey = idempotencyKeys.get(operationKey);
  if (!extKey) {
    extKey = uuidv4();
    idempotencyKeys.set(operationKey, extKey);
  }
  return extKey;
}

/**
 * Очищает ext_key после успешной операции
 */
function clearExtKey(operationKey: string): void {
  idempotencyKeys.delete(operationKey);
}

export function useCyclops({ layer }: UseCyclopsOptions) {
  const [state, setState] = useState<CyclopsState>({
    loading: false,
    error: null,
    errorInfo: null,
    cacheInfo: null,
  });

  // Ref для отслеживания активных запросов
  const activeRequests = useRef(new Set<string>());

  const call = useCallback(async <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<JsonRpcResponse<T> & { _cache?: CacheInfo; _errorInfo?: ErrorInfo }> => {
    setState({ loading: true, error: null, errorInfo: null, cacheInfo: null });

    try {
      const cacheableMethods = new Set([
        'list_beneficiary',
        'get_beneficiary',
        'list_virtual_account',
        'get_virtual_account',
        'list_virtual_transaction',
        'list_payments_v2',
        'get_payment',
      ]);
      const cacheKey = cacheableMethods.has(method)
        ? `${method}:${layer}:${JSON.stringify(params || {})}`
        : null;

      // Проверяем клиентский кеш
      if (cacheKey) {
        const cached = requestCache.get(cacheKey);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
          const data = await cached.promise;
          const cacheInfo: CacheInfo = {
            cached: true,
            remainingMs: cached.expiresAt - now,
          };
          setState({ loading: false, error: null, errorInfo: null, cacheInfo });
          return { ...(data as JsonRpcResponse<T>), _cache: cacheInfo };
        }
      }

      const requestPromise = (async () => {
        const response = await fetch('/api/cyclops', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layer, method, params }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Request failed');
        }

        if (data.error) {
          const error = new Error(data._errorInfo?.userMessage || data.error.message || JSON.stringify(data.error));
          const typedError = error as Error & { errorInfo?: ErrorInfo; code?: number };
          typedError.errorInfo = data._errorInfo;
          if (typeof data.error.code === 'number') {
            typedError.code = data.error.code;
          }
          throw error;
        }

        return data as JsonRpcResponse<T>;
      })();

      if (cacheKey) {
        requestCache.set(cacheKey, {
          promise: requestPromise,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }

      const data = await requestPromise;
      const dataWithCache = data as JsonRpcResponse<T> & { _cache?: CacheInfo };

      if (cacheKey && dataWithCache._cache?.nextAllowedAt) {
        const nextAllowedMs = new Date(dataWithCache._cache.nextAllowedAt).getTime();
        if (Number.isFinite(nextAllowedMs) && nextAllowedMs > Date.now()) {
          const entry = requestCache.get(cacheKey);
          if (entry) {
            entry.expiresAt = nextAllowedMs;
          }
        }
      }
      const cacheInfo = dataWithCache._cache;
      setState({ loading: false, error: null, errorInfo: null, cacheInfo: cacheInfo || null });
      return dataWithCache;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const errorInfo = (error as Error & { errorInfo?: ErrorInfo })?.errorInfo || null;
      setState({ loading: false, error: message, errorInfo, cacheInfo: null });

      // Удаляем из кеша при ошибке
      const cacheableMethods = ['list_beneficiary', 'get_beneficiary', 'list_virtual_account', 'get_virtual_account', 'list_virtual_transaction', 'list_payments_v2', 'get_payment'];
      if (cacheableMethods.includes(method)) {
        const cacheKey = `${method}:${layer}:${JSON.stringify(params || {})}`;
        requestCache.delete(cacheKey);
      }
      throw error;
    }
  }, [layer]);

  // ==================== БЕНЕФИЦИАРЫ ====================

  const createBeneficiaryUL = useCallback(
    async (params: {
      inn: string;
      nominal_account_code?: string;
      nominal_account_bic?: string;
      beneficiary_data: {
        name: string;
        kpp: string;
        ogrn?: string;
        is_active_activity?: boolean;
      };
    }) => {
      const result = await call('create_beneficiary_ul', params);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const createBeneficiaryIP = useCallback(
    async (params: CreateBeneficiaryIpInput) => {
      const requestParams = buildCreateBeneficiaryIpParams(params);
      const result = await call('create_beneficiary_ip', requestParams);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const createBeneficiaryFL = useCallback(
    async (params: CreateBeneficiaryFlInput) => {
      const requestParams = buildCreateBeneficiaryFlParams(params);
      const result = await call('create_beneficiary_fl', requestParams);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );
  const getBeneficiary = useCallback(
    (beneficiary_id: string) => call<GetBeneficiaryResult>('get_beneficiary', { beneficiary_id }),
    [call]
  );

  const listBeneficiaries = useCallback(
    (filters?: { is_active?: boolean; legal_type?: 'F' | 'I' | 'J'; inn?: string }) =>
      call<ListBeneficiariesResult>('list_beneficiary', {
        page: 1,
        per_page: 100,
        filters: filters || {},
      }),
    [call]
  );

  const activateBeneficiary = useCallback(
    async (beneficiary_id: string) => {
      const result = await call('activate_beneficiary', { beneficiary_id });
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      clearCacheByPrefix(`get_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const deactivateBeneficiary = useCallback(
    async (beneficiary_id: string) => {
      const result = await call('deactivate_beneficiary', { beneficiary_id });
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      clearCacheByPrefix(`get_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const addBeneficiaryDocumentsData = useCallback(
    async (params: AddBeneficiaryDocumentsParams) => {
      const result = await call<AddBeneficiaryDocumentsResult>('add_beneficiary_documents_data', params);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      clearCacheByPrefix(`get_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const updateBeneficiaryUL = useCallback(
    async (params: UpdateBeneficiaryUlInput) => {
      const requestParams = buildUpdateBeneficiaryUlParams(params);
      const result = await call<UpdateBeneficiaryResult>('update_beneficiary_ul', requestParams);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      clearCacheByPrefix(`get_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const updateBeneficiaryIP = useCallback(
    async (params: UpdateBeneficiaryIpInput) => {
      const requestParams = buildUpdateBeneficiaryIpParams(params);
      const result = await call<UpdateBeneficiaryResult>('update_beneficiary_ip', requestParams);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      clearCacheByPrefix(`get_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const updateBeneficiaryFL = useCallback(
    async (params: UpdateBeneficiaryFlInput) => {
      const requestParams = buildUpdateBeneficiaryFlParams(params);
      const result = await call<UpdateBeneficiaryResult>('update_beneficiary_fl', requestParams);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      clearCacheByPrefix(`get_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  // ==================== ВИРТУАЛЬНЫЕ СЧЕТА ====================

  const createVirtualAccount = useCallback(
    async (params: { beneficiary_id: string; type: 'standard' | 'for_ndfl' }) => {
      const result = await call('create_virtual_account', {
        beneficiary_id: params.beneficiary_id,
        virtual_account_type: params.type,
      });
      clearCacheByPrefix(`list_virtual_account:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const getVirtualAccount = useCallback(
    (virtual_account: string) =>
      call<GetVirtualAccountResult>('get_virtual_account', { virtual_account }),
    [call]
  );

  const listVirtualAccounts = useCallback(
    (params?: {
      page?: number;
      per_page?: number;
      filters?: {
        beneficiary?: {
          id?: string;
          is_active?: boolean;
          legal_type?: 'F' | 'I' | 'J';
          inn?: string;
        };
      };
    }) => {
      const requestParams: Record<string, unknown> = {
        page: params?.page ?? 1,
        per_page: params?.per_page ?? 100,
      };
      const beneficiary = params?.filters?.beneficiary;
      if (beneficiary && Object.keys(beneficiary).length > 0) {
        requestParams.filters = params?.filters;
      }
      return call<ListVirtualAccountsResult>('list_virtual_account', requestParams);
    },
    [call]
  );

  const listVirtualTransactions = useCallback(
    (params: {
      page?: number;
      per_page?: number;
      filters: {
        virtual_account?: string;
        deal_id?: string;
        payment_id?: string;
        created_date_from?: string;
        created_date_to?: string;
        incoming?: boolean;
        operation_type?: OperationType;
        include_block_operations?: boolean;
      };
    }) =>
      call<ListVirtualTransactionsResult>('list_virtual_transaction', {
        page: params.page ?? 1,
        per_page: params.per_page ?? 100,
        filters: params.filters,
      }),
    [call]
  );

  /**
   * Вывод средств с виртуального счёта (с поддержкой идемпотентности)
   */
  const refundVirtualAccount = useCallback(
    async (params: {
      virtual_account: string;
      recipient: {
        amount: number;
        account: string;
        bank_code: string;
        name: string;
        inn?: string;
        kpp?: string;
        document_number?: string;
      };
      purpose?: string;
      ext_key?: string;
      identifier?: string;
    }) => {
      // Генерируем ext_key для идемпотентности, если не передан
      const operationKey = `refund:${params.virtual_account}:${params.recipient.amount}:${params.recipient.account}`;
      const ext_key = params.ext_key || getOrCreateExtKey(operationKey);

      try {
        const result = await call<RefundVirtualAccountResult>('refund_virtual_account', {
          ...params,
          ext_key,
        });
        // Очищаем ext_key после успешного запроса
        clearExtKey(operationKey);
        clearCacheByPrefix(`get_virtual_account:${layer}:`);
        clearCacheByPrefix(`list_virtual_transaction:${layer}:`);
        return result;
      } catch (error) {
        // Не очищаем ext_key при ошибке 4909 (запрос в процессе)
        const errorInfo = (error as Error & { errorInfo?: ErrorInfo })?.errorInfo;
        if (!errorInfo?.isIdempotentInProcess) {
          clearExtKey(operationKey);
        }
        throw error;
      }
    },
    [call, layer]
  );

  /**
   * Перевод между счетами (v1)
   */
  const transferBetweenVirtualAccounts = useCallback(
    async (params: {
      from_virtual_account: string;
      to_virtual_account: string;
      amount: number;
    }) => {
      const result = await call<TransferBetweenAccountsResult>('transfer_between_virtual_accounts', params);
      clearCacheByPrefix(`get_virtual_account:${layer}:`);
      clearCacheByPrefix(`list_virtual_transaction:${layer}:`);
      return result;
    },
    [call, layer]
  );

  /**
   * Перевод между счетами (v2, с идемпотентностью)
   */
  const transferBetweenVirtualAccountsV2 = useCallback(
    async (params: {
      from_virtual_account: string;
      to_virtual_account: string;
      amount: number;
      purpose?: string;
      ext_key?: string;
    }) => {
      // Генерируем ext_key для идемпотентности, если не передан
      const operationKey = `transfer:${params.from_virtual_account}:${params.to_virtual_account}:${params.amount}`;
      const ext_key = params.ext_key || getOrCreateExtKey(operationKey);

      try {
        const result = await call<TransferBetweenAccountsV2Result>('transfer_between_virtual_accounts_v2', {
          ...params,
          ext_key,
        });
        clearExtKey(operationKey);
        clearCacheByPrefix(`get_virtual_account:${layer}:`);
        clearCacheByPrefix(`list_virtual_transaction:${layer}:`);
        return result;
      } catch (error) {
        const errorInfo = (error as Error & { errorInfo?: ErrorInfo })?.errorInfo;
        if (!errorInfo?.isIdempotentInProcess) {
          clearExtKey(operationKey);
        }
        throw error;
      }
    },
    [call, layer]
  );

  /**
   * Получение статуса перевода
   */
  const getVirtualAccountsTransfer = useCallback(
    (transfer_id: string) =>
      call<GetVirtualAccountsTransferResult>('get_virtual_accounts_transfer', { transfer_id }),
    [call]
  );

  // ==================== СДЕЛКИ ====================

  const createDeal = useCallback(
    (params: {
      payers: Array<{ virtual_account: string; amount: number }>;
      recipients: Array<Record<string, unknown>>;
    }) => call('create_deal', params),
    [call]
  );

  const getDeal = useCallback(
    (deal_id: string) => call('get_deal', { deal_id }),
    [call]
  );

  const listDeals = useCallback(
    (filters?: { status?: string[]; date_from?: string; date_to?: string }) =>
      call('list_deals', filters),
    [call]
  );

  const executeDeal = useCallback(
    (deal_id: string) => call('execute_deal', { deal_id }),
    [call]
  );

  const rejectDeal = useCallback(
    (deal_id: string) => call('rejected_deal', { deal_id }),
    [call]
  );

  // ==================== ПЛАТЕЖИ ====================

  const listPayments = useCallback(
    async (params?: ListPaymentsV2Params) => {
      const requestParams: Record<string, unknown> = {
        page: params?.page ?? 1,
        per_page: params?.per_page ?? 100,
      };
      if (params?.filters && Object.keys(params.filters).length > 0) {
        requestParams.filters = params.filters;
      }
      return call<ListPaymentsV2Result>('list_payments_v2', requestParams);
    },
    [call]
  );

  const getPayment = useCallback(
    (payment_id: string) => call<GetPaymentResult>('get_payment', { payment_id }),
    [call]
  );

  const identifyPayment = useCallback(
    async (params: IdentifyPaymentParams) => {
      const result = await call<IdentifyPaymentResult>(
        'identification_payment',
        params as unknown as Record<string, unknown>
      );
      // Инвалидируем кэш платежей после успешной идентификации
      clearCacheByPrefix(`list_payments_v2:${layer}:`);
      clearCacheByPrefix(`get_payment:${layer}:`);
      return result;
    },
    [call, layer]
  );

  // ==================== СБП ====================

  const listBanksSBP = useCallback(() => call('list_bank_sbp'), [call]);

  const generateSBPQRCode = useCallback(
    (params: { amount: number; purpose: string }) =>
      call('generate_sbp_qrcode', params),
    [call]
  );

  // ==================== ДОКУМЕНТЫ ====================

  const listDocuments = useCallback(
    (params?: {
      page?: number;
      per_page?: number;
      filters?: {
        beneficiary?: { id?: string };
        deal?: { id?: string };
        type?: string;
      };
    }) => {
      const requestParams: Record<string, unknown> = {
        page: params?.page ?? 1,
        per_page: params?.per_page ?? 100,
      };
      if (params?.filters && Object.keys(params.filters).length > 0) {
        requestParams.filters = params.filters;
      }
      return call<ListDocumentsResult>('list_documents', requestParams);
    },
    [call]
  );

  const getDocument = useCallback(
    (document_id: string) => call<GetDocumentResult>('get_document', { document_id }),
    [call]
  );

  const uploadDocumentBeneficiary = useCallback(
    (params: {
      beneficiary_id: string;
      document_type: 'contract_offer';
      file: File;
      document_date?: string;
      document_number?: string;
    }) =>
      (async () => {
        const formData = new FormData();
        formData.append('layer', layer);
        formData.append('beneficiary_id', params.beneficiary_id);
        formData.append('document_type', params.document_type);
        if (params.document_date) {
          formData.append('document_date', params.document_date);
        }
        if (params.document_number) {
          formData.append('document_number', params.document_number);
        }
        formData.append('file', params.file, params.file.name);

        const response = await fetch('/api/cyclops/upload-document', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || 'Ошибка при загрузке документа');
        }

        return data as UploadDocumentResult;
      })(),
    [layer]
  );

  // ==================== УТИЛИТЫ ====================

  const echo = useCallback(
    (text: string) => call('echo', { text }),
    [call]
  );

  /**
   * Очищает весь клиентский кеш
   */
  const clearCache = useCallback(() => {
    requestCache.clear();
  }, []);

  /**
   * Очищает кеш для конкретного метода
   */
  const invalidateCache = useCallback(
    (method: string) => {
      clearCacheByPrefix(`${method}:${layer}:`);
    },
    [layer]
  );

  return {
    ...state,
    call,
    // Бенефициары
    createBeneficiaryUL,
    createBeneficiaryIP,
    createBeneficiaryFL,
    getBeneficiary,
    listBeneficiaries,
    activateBeneficiary,
    deactivateBeneficiary,
    addBeneficiaryDocumentsData,
    updateBeneficiaryUL,
    updateBeneficiaryIP,
    updateBeneficiaryFL,
    // Виртуальные счета
    createVirtualAccount,
    getVirtualAccount,
    listVirtualAccounts,
    listVirtualTransactions,
    refundVirtualAccount,
    transferBetweenVirtualAccounts,
    transferBetweenVirtualAccountsV2,
    getVirtualAccountsTransfer,
    // Сделки
    createDeal,
    getDeal,
    listDeals,
    executeDeal,
    rejectDeal,
    // Платежи
    listPayments,
    getPayment,
    identifyPayment,
    // СБП
    listBanksSBP,
    generateSBPQRCode,
    listDocuments,
    getDocument,
    uploadDocumentBeneficiary,
    // Утилиты
    echo,
    clearCache,
    invalidateCache,
  };
}
