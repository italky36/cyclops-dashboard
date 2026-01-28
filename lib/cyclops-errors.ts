/**
 * Обработка и маппинг ошибок Cyclops API
 */

import { CYCLOPS_ERROR_CODES, CYCLOPS_ERROR_MESSAGES, type CyclopsError } from '@/types/cyclops';
import { maskSensitiveData } from './cyclops-validators';

/**
 * Структура обработанной ошибки Cyclops
 */
export interface ProcessedCyclopsError {
  code: number;
  userMessage: string;
  debugMessage: string;
  isRetryable: boolean;
  isIdempotentInProcess: boolean;
}

/**
 * Обрабатывает ошибку Cyclops и возвращает структурированный ответ
 */
export function processCyclopsError(error: CyclopsError): ProcessedCyclopsError {
  const code = error.code;
  const userMessage = CYCLOPS_ERROR_MESSAGES[code] || error.message || 'Неизвестная ошибка';

  // Формируем debug-сообщение с дополнительной информацией
  let debugMessage = `Code: ${code}, Message: ${error.message}`;
  if (error.data) {
    debugMessage += `, Data: ${JSON.stringify(error.data)}`;
  }
  if (error.meta) {
    debugMessage += `, Meta: ${JSON.stringify(error.meta)}`;
  }

  // Определяем, можно ли повторить запрос
  const retryableCodes = new Set([
    500, 502, 503, 504, // Server errors
  ]);
  const isRetryable = retryableCodes.has(code);

  // Проверяем, является ли это ошибкой идемпотентности
  const isIdempotentInProcess = code === CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS;

  return {
    code,
    userMessage,
    debugMessage,
    isRetryable,
    isIdempotentInProcess,
  };
}

/**
 * Расширенные сообщения с подсказками для пользователя
 */
export function getErrorUserHint(code: number): string | null {
  switch (code) {
    case CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND:
      return 'Проверьте ID бенефициара или создайте нового';
    case CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_ACTIVE:
      return 'Активируйте бенефициара перед выполнением операции';
    case CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND:
      return 'Проверьте номер виртуального счёта';
    case CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS:
      return 'Пополните виртуальный счёт или уменьшите сумму операции';
    case CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS:
      return 'Дождитесь завершения предыдущего запроса или обновите страницу для проверки статуса';
    case CYCLOPS_ERROR_CODES.RESTRICTIONS_IMPOSED:
      return 'Свяжитесь с банком для уточнения ограничений';
    case CYCLOPS_ERROR_CODES.INCORRECT_VO_CODES:
      return 'Проверьте коды валютных операций для платежа нерезиденту';
    default:
      return null;
  }
}

/**
 * Структура для логирования запросов Cyclops
 */
export interface CyclopsLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  layer: 'pre' | 'prod';
  params: Record<string, unknown>;
  success: boolean;
  errorCode?: number;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Создаёт запись лога для запроса Cyclops
 */
export function createLogEntry(
  requestId: string,
  method: string,
  layer: 'pre' | 'prod',
  params: Record<string, unknown>,
  success: boolean,
  durationMs: number,
  error?: CyclopsError
): CyclopsLogEntry {
  return {
    timestamp: new Date().toISOString(),
    requestId,
    method,
    layer,
    params: maskSensitiveData(params),
    success,
    errorCode: error?.code,
    errorMessage: error?.message,
    durationMs,
  };
}

/**
 * Логирует запрос Cyclops (безопасно маскируя чувствительные данные)
 */
export function logCyclopsRequest(entry: CyclopsLogEntry): void {
  const logLevel = entry.success ? 'info' : 'error';
  const prefix = `[Cyclops ${entry.layer.toUpperCase()}]`;

  if (logLevel === 'error') {
    console.error(prefix, {
      requestId: entry.requestId,
      method: entry.method,
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
      durationMs: entry.durationMs,
      params: entry.params,
    });
  } else if (process.env.NODE_ENV === 'development' || process.env.DEBUG_CYCLOPS === '1') {
    console.info(prefix, {
      requestId: entry.requestId,
      method: entry.method,
      durationMs: entry.durationMs,
    });
  }
}

/**
 * Проверяет, является ли ошибка связанной с недостатком средств
 */
export function isInsufficientFundsError(error: CyclopsError): boolean {
  return error.code === CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS;
}

/**
 * Проверяет, является ли ошибка связанной с несуществующим счётом
 */
export function isAccountNotFoundError(error: CyclopsError): boolean {
  return error.code === CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND;
}

/**
 * Проверяет, является ли ошибка связанной с бенефициаром
 */
export function isBeneficiaryError(error: CyclopsError): boolean {
  return (
    error.code === CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND ||
    error.code === CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_ACTIVE
  );
}

/**
 * Проверяет, нужно ли показать пользователю специальный UI для ошибки идемпотентности
 */
export function shouldShowIdempotencyUI(error: CyclopsError): boolean {
  return error.code === CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS;
}
