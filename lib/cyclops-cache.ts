/**
 * Серверный кеш для Cyclops API с лимитером 5 минут
 *
 * Ограничение Cyclops: не чаще 1 запроса в 5 минут с одинаковыми параметрами
 * для методов: list_virtual_account, get_virtual_account, list_virtual_transaction
 */

import type { JsonRpcResponse } from '@/types/cyclops';

// TTL кеша - 5 минут (согласно ограничениям Cyclops)
const CACHE_TTL_MS = 5 * 60 * 1000;

// Методы, которые кешируются с ограничением 5 минут
const RATE_LIMITED_METHODS = new Set([
  'list_virtual_account',
  'get_virtual_account',
  'list_virtual_transaction',
  'list_beneficiary',
  'get_beneficiary',
  'list_payments_v2',
  'get_payment',
]);

interface CacheEntry {
  data: JsonRpcResponse<unknown>;
  expiresAt: number;
  cachedAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

// Серверный кеш (в памяти)
const cache = new Map<string, CacheEntry>();
const stats: CacheStats = { hits: 0, misses: 0, size: 0 };

/**
 * Генерирует ключ кеша на основе метода, слоя и параметров
 */
export function generateCacheKey(
  method: string,
  layer: 'pre' | 'prod',
  params: Record<string, unknown>
): string {
  // Сортируем ключи для консистентности
  const sortedParams = JSON.stringify(params, Object.keys(params).sort());
  return `${layer}:${method}:${sortedParams}`;
}

/**
 * Проверяет, должен ли метод кешироваться
 */
export function shouldCacheMethod(method: string): boolean {
  return RATE_LIMITED_METHODS.has(method);
}

/**
 * Получает данные из кеша
 */
export function getFromCache(cacheKey: string): CacheEntry | null {
  const entry = cache.get(cacheKey);

  if (!entry) {
    stats.misses++;
    return null;
  }

  // Проверяем, не истёк ли кеш
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    stats.size = cache.size;
    stats.misses++;
    return null;
  }

  stats.hits++;
  return entry;
}

/**
 * Сохраняет данные в кеш
 */
export function setInCache(
  cacheKey: string,
  data: JsonRpcResponse<unknown>,
  ttlMs: number = CACHE_TTL_MS
): void {
  const now = Date.now();
  cache.set(cacheKey, {
    data,
    expiresAt: now + ttlMs,
    cachedAt: now,
  });
  stats.size = cache.size;
}

/**
 * Очищает конкретную запись кеша
 */
export function invalidateCache(cacheKey: string): void {
  cache.delete(cacheKey);
  stats.size = cache.size;
}

/**
 * Очищает все записи кеша для определённого метода и слоя
 */
export function invalidateCacheByMethod(method: string, layer: 'pre' | 'prod'): void {
  const prefix = `${layer}:${method}:`;
  Array.from(cache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  });
  stats.size = cache.size;
}

/**
 * Очищает весь кеш
 */
export function clearCache(): void {
  cache.clear();
  stats.size = 0;
}

/**
 * Возвращает статистику кеша
 */
export function getCacheStats(): CacheStats & { hitRate: number } {
  const total = stats.hits + stats.misses;
  return {
    ...stats,
    hitRate: total > 0 ? stats.hits / total : 0,
  };
}

/**
 * Возвращает время до истечения кеша (в мс)
 * Используется для показа "данные из кеша" в UI
 */
export function getCacheTimeRemaining(cacheKey: string): number | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  const remaining = entry.expiresAt - Date.now();
  return remaining > 0 ? remaining : null;
}

/**
 * Проверяет, были ли данные получены из кеша
 */
export function isCachedResponse(cacheKey: string): boolean {
  return cache.has(cacheKey);
}

/**
 * Возвращает информацию о кеше для клиента
 */
export function getCacheInfo(cacheKey: string): {
  cached: boolean;
  cachedAt?: string;
  expiresAt?: string;
  remainingMs?: number;
  nextAllowedAt?: string;
  cacheAgeSeconds?: number;
} {
  const entry = cache.get(cacheKey);

  if (!entry) {
    return { cached: false };
  }

  const now = Date.now();
  if (now > entry.expiresAt) {
    return { cached: false };
  }

  return {
    cached: true,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    remainingMs: entry.expiresAt - now,
    nextAllowedAt: new Date(entry.expiresAt).toISOString(),
    cacheAgeSeconds: Math.floor((now - entry.cachedAt) / 1000),
  };
}

/**
 * Периодическая очистка истёкших записей
 */
export function cleanupExpiredCache(): number {
  const now = Date.now();
  let cleaned = 0;

  Array.from(cache.entries()).forEach(([key, entry]) => {
    if (now > entry.expiresAt) {
      cache.delete(key);
      cleaned++;
    }
  });

  stats.size = cache.size;
  return cleaned;
}

// Автоматическая очистка каждые 5 минут (в Node.js)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredCache, CACHE_TTL_MS);
}

/**
 * Обёртка для кеширования запросов Cyclops
 */
export async function withCache<T>(
  cacheKey: string,
  fetchFn: () => Promise<JsonRpcResponse<T>>,
  options?: {
    ttlMs?: number;
    forceRefresh?: boolean;
  }
): Promise<{ data: JsonRpcResponse<T>; fromCache: boolean; cacheInfo: ReturnType<typeof getCacheInfo> }> {
  // Проверяем кеш, если не запрошено принудительное обновление
  if (!options?.forceRefresh) {
    const cached = getFromCache(cacheKey);
    if (cached) {
      return {
        data: cached.data as JsonRpcResponse<T>,
        fromCache: true,
        cacheInfo: getCacheInfo(cacheKey),
      };
    }
  }

  // Выполняем запрос
  const data = await fetchFn();

  // Сохраняем в кеш только успешные ответы
  if (!data.error) {
    setInCache(cacheKey, data, options?.ttlMs);
  }

  return {
    data,
    fromCache: false,
    cacheInfo: getCacheInfo(cacheKey),
  };
}
