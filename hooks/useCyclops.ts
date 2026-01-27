'use client';

import { useState, useCallback } from 'react';
import type { Layer, JsonRpcResponse } from '@/types/cyclops';

interface UseCyclopsOptions {
  layer: Layer;
}

interface CyclopsState {
  loading: boolean;
  error: string | null;
}

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

      setState({ loading: false, error: null });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setState({ loading: false, error: message });
      throw error;
    }
  }, [layer]);

  // Бенефициары
  const createBeneficiaryUL = useCallback(
    (params: { inn: string; name: string; kpp: string }) =>
      call('create_beneficiary_ul', params),
    [call]
  );

  const createBeneficiaryIP = useCallback(
    (params: { inn: string; first_name: string; middle_name?: string; last_name: string }) =>
      call('create_beneficiary_ip', params),
    [call]
  );

  const createBeneficiaryFL = useCallback(
    (params: {
      inn: string;
      first_name: string;
      middle_name?: string;
      last_name: string;
      birth_date: string;
      birth_place: string;
      passport_series: string;
      passport_number: string;
      passport_date: string;
      registration_address: string;
    }) => call('create_beneficiary_fl', params),
    [call]
  );

  const getBeneficiary = useCallback(
    (beneficiary_id: string) => call('get_beneficiary', { beneficiary_id }),
    [call]
  );

  const listBeneficiaries = useCallback(
    (filters?: { is_active?: boolean }) => call('list_beneficiary', filters),
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
      call('create_virtual_account', params),
    [call]
  );

  const getVirtualAccount = useCallback(
    (virtual_account: string) => call('get_virtual_account', { virtual_account }),
    [call]
  );

  const listVirtualAccounts = useCallback(
    (filters?: { is_active?: boolean }) => call('list_virtual_account', filters),
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
