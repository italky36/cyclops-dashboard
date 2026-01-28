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
      return 'Выберите корректный virtual_account типа standard или создайте новый виртуальный счёт';
    case CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS:
      return 'Пополните виртуальный счёт или уменьшите сумму операции';
    case CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS:
      return 'Дождитесь завершения предыдущего запроса или обновите страницу для проверки статуса';
    case CYCLOPS_ERROR_CODES.RESTRICTIONS_IMPOSED:
      return 'Обратитесь в поддержку/комплаенс';
    case CYCLOPS_ERROR_CODES.INCORRECT_VO_CODES:
      return 'Проверьте коды валютных операций для платежа нерезиденту';
    case CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND:
      return 'Обновите список, проверьте слой и фильтры account/bic';
    case CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH:
      return 'Исправьте owners.amount, сумма должна совпасть с суммой платежа (2 знака после запятой)';
    case CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED:
      return 'Обновите детали и проверьте статус identify';
    case CYCLOPS_ERROR_CODES.REFUND_ERROR:
      return 'Повторите позже, проверьте статус платежа и доступность возврата';
    case CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR:
      return 'Повторите позже, при повторе — обратитесь в поддержку';
    default:
      return null;
  }
}

/**
 * Конфигурация ошибок платежей с title, message, hint и actions
 */
export interface PaymentErrorConfig {
  title: string;
  message: string;
  hint: string;
  actions?: Array<{
    label: string;
    kind: 'retry' | 'refresh' | 'link' | 'noop';
    href?: string;
  }>;
}

export const PAYMENT_ERROR_CONFIG: Record<number, PaymentErrorConfig> = {
  [CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND]: {
    title: 'Виртуальный счёт не найден',
    message: 'Указанный virtual_account не существует или недоступен.',
    hint: 'Выберите корректный virtual_account типа standard или создайте новый виртуальный счёт.',
    actions: [
      { label: 'Перейти к Virtual Accounts', kind: 'link', href: '/virtual-accounts' },
    ],
  },
  [CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND]: {
    title: 'Платёж не найден',
    message: 'Платёж с таким ID отсутствует.',
    hint: 'Обновите список, проверьте слой и фильтры account/bic.',
    actions: [
      { label: 'Обновить список', kind: 'link', href: '/payments' },
    ],
  },
  [CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH]: {
    title: 'Суммы не совпадают',
    message: 'Сумма распределения owners отличается от суммы платежа.',
    hint: 'Исправьте owners.amount, сумма должна совпасть (2 знака после запятой).',
  },
  [CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED]: {
    title: 'Платёж уже идентифицирован',
    message: 'Операция не требуется.',
    hint: 'Обновите детали и проверьте статус identify.',
    actions: [
      { label: 'Обновить', kind: 'refresh' },
    ],
  },
  [CYCLOPS_ERROR_CODES.REFUND_ERROR]: {
    title: 'Ошибка возврата платежа',
    message: 'Возврат не выполнен.',
    hint: 'Повторите позже, проверьте статус платежа и доступность возврата.',
    actions: [
      { label: 'Повторить', kind: 'retry' },
    ],
  },
  [CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR]: {
    title: 'Ошибка комплаенс-проверки',
    message: 'Не удалось получить результат compliance.',
    hint: 'Повторите позже, при повторе — обратитесь в поддержку.',
    actions: [
      { label: 'Повторить', kind: 'retry' },
    ],
  },
  [CYCLOPS_ERROR_CODES.RESTRICTIONS_IMPOSED]: {
    title: 'Ограничения по ИП/исп. производству',
    message: 'Операция запрещена ограничениями.',
    hint: 'Обратитесь в поддержку/комплаенс.',
  },
};

/**
 * Получает конфигурацию ошибки для платежей
 */
export function getPaymentErrorConfig(code: number): PaymentErrorConfig | null {
  return PAYMENT_ERROR_CONFIG[code] || null;
}

/**
 * Проверяет, является ли ошибка связанной с платежами
 */
export function isPaymentError(error: CyclopsError): boolean {
  const paymentErrorCodes: number[] = [
    CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
    CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
    CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED,
    CYCLOPS_ERROR_CODES.REFUND_ERROR,
    CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR,
  ];
  return paymentErrorCodes.includes(error.code);
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
