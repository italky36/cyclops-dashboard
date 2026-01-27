'use client';

import { useState, useCallback } from 'react';
import type {
  Layer,
  JsonRpcResponse,
  ListBeneficiariesResult,
  GetBeneficiaryResult,
  ListVirtualAccountsResult,
  GetVirtualAccountResult,
} from '@/types/cyclops';

interface UseCyclopsOptions {
  layer: Layer;
}

interface CyclopsState {
  loading: boolean;
  error: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const requestCache = new Map<
  string,
  {
    expiresAt: number;
    promise: Promise<JsonRpcResponse<unknown>>;
  }
>();

const clearCacheByPrefix = (prefix: string) => {
  Array.from(requestCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      requestCache.delete(key);
    }
  });
};

export function useCyclops({ layer }: UseCyclopsOptions) {
  const [state, setState] = useState<CyclopsState>({
    loading: false,
    error: null,
  });

  const call = useCallback(async <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<JsonRpcResponse<T>> => {
    setState({ loading: true, error: null });

    try {
      const cacheableMethods = new Set([
        'list_beneficiary',
        'get_beneficiary',
        'list_virtual_account',
        'get_virtual_account',
        'list_virtual_transaction',
      ]);
      const cacheKey = cacheableMethods.has(method)
        ? `${method}:${layer}:${JSON.stringify(params || {})}`
        : null;

      if (cacheKey) {
        const cached = requestCache.get(cacheKey);
        const now = Date.now();
        if (cached && cached.expiresAt > now) {
          const data = await cached.promise;
          setState({ loading: false, error: null });
          return data as JsonRpcResponse<T>;
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
          throw new Error(data.error.message || JSON.stringify(data.error));
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
      setState({ loading: false, error: null });
      return data as JsonRpcResponse<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState({ loading: false, error: message });
      if (error instanceof Error) {
        // Drop cached failures so next attempt can retry
        if (method === 'list_beneficiary' || method === 'get_beneficiary' || method === 'list_virtual_account' || method === 'get_virtual_account' || method === 'list_virtual_transaction') {
          const cacheKey = `${method}:${layer}:${JSON.stringify(params || {})}`;
          requestCache.delete(cacheKey);
        }
      }
      throw error;
    }
  }, [layer]);

  // Бенефициары
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
    async (params: {
      inn: string;
      nominal_account_code?: string;
      nominal_account_bic?: string;
      beneficiary_data: {
        first_name: string;
        middle_name?: string;
        last_name: string;
        tax_resident?: boolean;
      };
    }) => {
      const result = await call('create_beneficiary_ip', params);
      clearCacheByPrefix(`list_beneficiary:${layer}:`);
      return result;
    },
    [call, layer]
  );

  const createBeneficiaryFL = useCallback(
    async (params: {
      inn: string;
      nominal_account_code?: string;
      nominal_account_bic?: string;
      beneficiary_data: {
        first_name: string;
        middle_name?: string;
        last_name: string;
        birth_date: string;
        birth_place: string;
        passport_series: string;
        passport_number: string;
        passport_date: string;
        registration_address: string;
        resident?: boolean;
        reg_country_code?: string;
        tax_resident?: boolean;
      };
    }) => {
      const result = await call('create_beneficiary_fl', params);
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
    (beneficiary_id: string) => call('activate_beneficiary', { beneficiary_id }),
    [call]
  );

  const deactivateBeneficiary = useCallback(
    (beneficiary_id: string) => call('deactivate_beneficiary', { beneficiary_id }),
    [call]
  );

  // Виртуальные счета
  const createVirtualAccount = useCallback(
    (params: { beneficiary_id: string; type: 'standard' | 'for_ndfl' }) =>
      call('create_virtual_account', {
        beneficiary_id: params.beneficiary_id,
        virtual_account_type: params.type,
      }),
    [call]
  );

  const getVirtualAccount = useCallback(
    (virtual_account: string) =>
      call<GetVirtualAccountResult>('get_virtual_account', { virtual_account }),
    [call]
  );

  const listVirtualAccounts = useCallback(
    (filters?: {
      beneficiary?: {
        id?: string;
        is_active?: boolean;
        legal_type?: 'F' | 'I' | 'J';
        inn?: string;
      };
    }) =>
      call<ListVirtualAccountsResult>('list_virtual_account', (() => {
        const beneficiary = filters?.beneficiary;
        const hasBeneficiaryFilters = beneficiary && Object.keys(beneficiary).length > 0;
        const params: Record<string, unknown> = {
          page: 1,
          per_page: 100,
        };
        if (hasBeneficiaryFilters) {
          params.filters = filters;
        }
        return params;
      })()),
    [call]
  );

  const refundVirtualAccount = useCallback(
    (params: {
      virtual_account: string;
      amount: number;
      account: string;
      bank_code: string;
      name: string;
      inn: string;
    }) => call('refund_virtual_account', params),
    [call]
  );

  // Сделки
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

  // Платежи
  const listPayments = useCallback(
    (filters?: { type?: string; identified?: boolean }) =>
      call('list_payments_v2', filters),
    [call]
  );

  const getPayment = useCallback(
    (payment_id: string) => call('get_payment', { payment_id }),
    [call]
  );

  const identifyPayment = useCallback(
    (params: {
      payment_id: string;
      owners: Array<{ virtual_account: string; amount: number }>;
    }) => call('identification_payment', params),
    [call]
  );

  // СБП
  const listBanksSBP = useCallback(() => call('list_bank_sbp'), [call]);

  const generateSBPQRCode = useCallback(
    (params: { amount: number; purpose: string }) =>
      call('generate_sbp_qrcode', params),
    [call]
  );

  // Утилиты
  const echo = useCallback(
    (text: string) => call('echo', { text }),
    [call]
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
    // Виртуальные счета
    createVirtualAccount,
    getVirtualAccount,
    listVirtualAccounts,
    refundVirtualAccount,
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
    // Утилиты
    echo,
  };
}
