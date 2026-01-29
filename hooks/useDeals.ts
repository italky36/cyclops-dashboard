'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  Deal,
  DealListItem,
  ListDealsParams,
  CreateDealParams,
  CreateDealResponse,
  ListDealsResponse,
  ComplianceCheckPayment,
} from '@/types/cyclops/deals';

// ============================================
// Хук для списка сделок
// ============================================

interface UseDealsOptions {
  autoFetch?: boolean;
  initialParams?: ListDealsParams;
}

interface UseDealsReturn {
  deals: DealListItem[];
  loading: boolean;
  error: string | null;
  meta: { total: number; currentPage: number; perPage: number } | null;
  fetchDeals: (params?: ListDealsParams) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useDeals(options: UseDealsOptions = {}): UseDealsReturn {
  const { autoFetch = true, initialParams } = options;

  const [deals, setDeals] = useState<DealListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<UseDealsReturn['meta']>(null);
  const lastParamsRef = useRef<ListDealsParams | undefined>(initialParams);

  const fetchDeals = useCallback(async (params?: ListDealsParams) => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = params || lastParamsRef.current || {};
      lastParamsRef.current = queryParams;

      const query = new URLSearchParams();

      if (queryParams.page) query.set('page', String(queryParams.page));
      if (queryParams.per_page) query.set('per_page', String(queryParams.per_page));

      if (queryParams.filters) {
        const { status, ext_key, created_date_from, created_date_to, updated_at_from, updated_at_to } = queryParams.filters;
        if (status) query.set('status', status);
        if (ext_key) query.set('ext_key', ext_key);
        if (created_date_from) query.set('created_date_from', created_date_from);
        if (created_date_to) query.set('created_date_to', created_date_to);
        if (updated_at_from) query.set('updated_at_from', updated_at_from);
        if (updated_at_to) query.set('updated_at_to', updated_at_to);
      }

      const res = await fetch(`/api/deals?${query.toString()}`);
      const data: ListDealsResponse | { result?: ListDealsResponse } = await res.json();

      if (!res.ok) {
        throw new Error((data as any).error || 'Ошибка загрузки сделок');
      }

      const payload =
        (data as { result?: ListDealsResponse }).result ?? (data as ListDealsResponse);
      const dealsList = Array.isArray(payload?.deals) ? payload.deals : [];
      const meta = payload?.meta;

      setDeals(dealsList);
      if (meta && typeof meta.total === 'number' && meta.page) {
        setMeta({
          total: meta.total,
          currentPage: meta.page.current_page,
          perPage: meta.page.per_page,
        });
      } else {
        setMeta(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => fetchDeals(lastParamsRef.current), [fetchDeals]);

  useEffect(() => {
    if (autoFetch) {
      fetchDeals(initialParams);
    }
  }, [autoFetch, fetchDeals, initialParams]);

  return { deals, loading, error, meta, fetchDeals, refetch };
}

// ============================================
// Хук для одной сделки
// ============================================

interface UseDealReturn {
  deal: Deal | null;
  loading: boolean;
  error: string | null;
  fetchDeal: () => Promise<void>;
  executeDeal: (recipientNumbers?: number[]) => Promise<void>;
  rejectDeal: () => Promise<void>;
  cancelFromCorrection: () => Promise<void>;
  checkCompliance: () => Promise<ComplianceCheckPayment[]>;
  updateDeal: (dealData: CreateDealParams) => Promise<void>;
}

export function useDeal(dealId: string): UseDealReturn {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDeal = useCallback(async () => {
    if (!dealId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/deals/${dealId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Сделка не найдена');
      }

      const payload = data?.result ?? data;
      const deal = payload?.deal;
      if (!deal) {
        throw new Error('Сделка не найдена');
      }
      setDeal(deal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Исполнение сделки
  const executeDeal = useCallback(async (recipientNumbers?: number[]) => {
    setLoading(true);
    setError(null);

    try {
      const body = recipientNumbers
        ? { recipients_execute: recipientNumbers.map(n => ({ number: n })) }
        : {};

      const res = await fetch(`/api/deals/${dealId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка исполнения сделки');
      }

      // Обновляем данные сделки после исполнения
      await fetchDeal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [dealId, fetchDeal]);

  // Отмена сделки (статус new)
  const rejectDeal = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка отмены сделки');
      }

      await fetchDeal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [dealId, fetchDeal]);

  // Отмена из коррекции
  const cancelFromCorrection = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/deals/${dealId}/cancel`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка отмены из коррекции');
      }

      await fetchDeal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [dealId, fetchDeal]);

  // Проверка комплаенс
  const checkCompliance = useCallback(async (): Promise<ComplianceCheckPayment[]> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/deals/${dealId}/compliance`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка проверки комплаенс');
      }

      return data.compliance_check_payments;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Обновление сделки
  const updateDeal = useCallback(async (dealData: CreateDealParams) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка обновления сделки');
      }

      await fetchDeal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [dealId, fetchDeal]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  return {
    deal,
    loading,
    error,
    fetchDeal,
    executeDeal,
    rejectDeal,
    cancelFromCorrection,
    checkCompliance,
    updateDeal,
  };
}

// ============================================
// Хук для создания сделки
// ============================================

interface UseCreateDealReturn {
  createDeal: (params: CreateDealParams) => Promise<CreateDealResponse>;
  loading: boolean;
  error: string | null;
}

export function useCreateDeal(): UseCreateDealReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDeal = useCallback(async (params: CreateDealParams): Promise<CreateDealResponse> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка создания сделки');
      }

      const payload = data?.result ?? data;
      return payload as CreateDealResponse;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ошибка';
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createDeal, loading, error };
}
