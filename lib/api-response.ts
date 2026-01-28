/**
 * Унифицированный формат ответов API для UI
 * Используется для единообразного отображения loading/empty/error/rate-limit состояний
 */

import { getPaymentErrorConfig } from './cyclops-errors';
import type { CyclopsError } from '@/types/cyclops';

/**
 * Действие для ошибки
 */
export interface ErrorAction {
  label: string;
  kind: 'retry' | 'link' | 'copy' | 'noop' | 'refresh';
  href?: string;
  payload?: unknown;
}

/**
 * Структура ошибки в унифицированном формате
 */
export interface UnifiedError {
  code?: number | string;
  title: string;
  message: string;
  hint?: string;
  actions?: ErrorAction[];
}

/**
 * Мета-информация для пагинации
 */
export interface PaginationMeta {
  page?: number;
  total?: number;
  per_page?: number;
  current_page?: number;
}

/**
 * Информация о кэше
 */
export interface CacheInfo {
  cached: boolean;
  cachedAt?: string;
  expiresAt?: string;
  remainingMs?: number;
  nextAllowedAt?: string;
  cacheAgeSeconds?: number;
}

/**
 * Унифицированный формат ответа API
 */
export interface UnifiedApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: UnifiedError;
  meta?: PaginationMeta;
  cached?: boolean;
  cacheAgeSeconds?: number;
  nextAllowedAt?: string;
  requestId?: string;
}

/**
 * Создаёт успешный ответ
 */
export function createSuccessResponse<T>(
  data: T,
  options?: {
    meta?: PaginationMeta;
    cacheInfo?: CacheInfo;
    requestId?: string;
  }
): UnifiedApiResponse<T> {
  const response: UnifiedApiResponse<T> = {
    ok: true,
    data,
  };

  if (options?.meta) {
    response.meta = options.meta;
  }

  if (options?.cacheInfo) {
    response.cached = options.cacheInfo.cached;
    response.cacheAgeSeconds = options.cacheInfo.cacheAgeSeconds;
    response.nextAllowedAt = options.cacheInfo.nextAllowedAt;
  }

  if (options?.requestId) {
    response.requestId = options.requestId;
  }

  return response;
}

/**
 * Создаёт ответ с ошибкой
 */
export function createErrorResponse(
  error: UnifiedError,
  options?: {
    requestId?: string;
    cacheInfo?: CacheInfo;
  }
): UnifiedApiResponse<never> {
  const response: UnifiedApiResponse<never> = {
    ok: false,
    error,
  };

  if (options?.cacheInfo) {
    response.cached = options.cacheInfo.cached;
    response.nextAllowedAt = options.cacheInfo.nextAllowedAt;
  }

  if (options?.requestId) {
    response.requestId = options.requestId;
  }

  return response;
}

/**
 * Преобразует ошибку Cyclops в унифицированный формат
 */
export function cyclopsErrorToUnified(
  cyclopsError: CyclopsError,
  errorMessages: Record<number, string>
): UnifiedError {
  const code = cyclopsError.code;
  const config = getPaymentErrorConfig(code);

  if (config) {
    return {
      code,
      title: config.title,
      message: config.message,
      hint: config.hint,
      actions: config.actions,
    };
  }

  // Fallback для неизвестных ошибок
  const userMessage = errorMessages[code] || cyclopsError.message || 'Неизвестная ошибка';

  return {
    code,
    title: 'Ошибка',
    message: userMessage,
  };
}

/**
 * Создаёт ошибку валидации из массива ошибок Zod
 */
export function createValidationError(errors: string[]): UnifiedError {
  return {
    code: 'VALIDATION_ERROR',
    title: 'Некорректные данные',
    message: errors.join('; '),
  };
}

/**
 * Создаёт ошибку rate-limit
 */
export function createRateLimitError(nextAllowedAt: string): UnifiedError {
  return {
    code: 'RATE_LIMIT',
    title: 'Слишком частые запросы',
    message: 'Превышен лимит запросов. Данные из кэша.',
    hint: `Следующее обновление доступно после ${new Date(nextAllowedAt).toLocaleTimeString('ru-RU')}`,
    actions: [
      { label: 'Подождать', kind: 'noop' },
    ],
  };
}

/**
 * Создаёт ошибку сети
 */
export function createNetworkError(): UnifiedError {
  return {
    code: 'NETWORK_ERROR',
    title: 'Ошибка сети',
    message: 'Не удалось подключиться к серверу.',
    hint: 'Проверьте интернет-соединение и повторите попытку.',
    actions: [
      { label: 'Повторить', kind: 'retry' },
    ],
  };
}

/**
 * Создаёт ошибку "не найдено"
 */
export function createNotFoundError(entityName: string): UnifiedError {
  return {
    code: 'NOT_FOUND',
    title: `${entityName} не найден`,
    message: `Запрошенный ${entityName.toLowerCase()} не существует или был удалён.`,
    actions: [
      { label: 'Назад к списку', kind: 'link', href: '/payments' },
    ],
  };
}
