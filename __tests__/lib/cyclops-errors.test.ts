/**
 * Тесты для обработки и маппинга ошибок Cyclops API
 */

import {
  processCyclopsError,
  getErrorUserHint,
  getPaymentErrorConfig,
  isPaymentError,
  PAYMENT_ERROR_CONFIG,
  isInsufficientFundsError,
  isAccountNotFoundError,
  isBeneficiaryError,
  shouldShowIdempotencyUI,
  createLogEntry,
} from '@/lib/cyclops-errors';
import { CYCLOPS_ERROR_CODES, CYCLOPS_ERROR_MESSAGES, type CyclopsError } from '@/types/cyclops';

describe('processCyclopsError', () => {
  test('maps known error code to user-friendly message', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Payment not found',
    };
    const result = processCyclopsError(error);

    expect(result.code).toBe(4412);
    expect(result.userMessage).toBe('Платёж не найден');
  });

  test('uses original message for unknown error code', () => {
    const error: CyclopsError = {
      code: 9999,
      message: 'Unknown API error',
    };
    const result = processCyclopsError(error);

    expect(result.code).toBe(9999);
    expect(result.userMessage).toBe('Unknown API error');
  });

  test('includes debug message with code and original message', () => {
    const error: CyclopsError = {
      code: 4412,
      message: 'Payment not found',
    };
    const result = processCyclopsError(error);

    expect(result.debugMessage).toContain('Code: 4412');
    expect(result.debugMessage).toContain('Payment not found');
  });

  test('includes data in debug message when present', () => {
    const error: CyclopsError = {
      code: 4412,
      message: 'Payment not found',
      data: { payment_id: '123' },
    };
    const result = processCyclopsError(error);

    expect(result.debugMessage).toContain('payment_id');
  });

  test('includes meta in debug message when present', () => {
    const error: CyclopsError = {
      code: 4412,
      message: 'Payment not found',
      meta: { request_id: 'abc123' },
    };
    const result = processCyclopsError(error);

    expect(result.debugMessage).toContain('request_id');
  });

  test('identifies retryable server errors', () => {
    [500, 502, 503, 504].forEach((code) => {
      const error: CyclopsError = { code, message: 'Server error' };
      const result = processCyclopsError(error);
      expect(result.isRetryable).toBe(true);
    });
  });

  test('identifies non-retryable client errors', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Not found',
    };
    const result = processCyclopsError(error);

    expect(result.isRetryable).toBe(false);
  });

  test('identifies idempotent request in process', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS,
      message: 'Request in process',
    };
    const result = processCyclopsError(error);

    expect(result.isIdempotentInProcess).toBe(true);
  });
});

describe('getErrorUserHint', () => {
  test('returns hint for PAYMENT_NOT_FOUND (4412)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND);
    expect(hint).toContain('Обновите список');
    expect(hint).toContain('фильтры');
  });

  test('returns hint for PAYMENT_AMOUNT_MISMATCH (4413)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH);
    expect(hint).toContain('owners.amount');
    expect(hint).toContain('2 знака');
  });

  test('returns hint for PAYMENT_ALREADY_IDENTIFIED (4414)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED);
    expect(hint).toContain('статус identify');
  });

  test('returns hint for VIRTUAL_ACCOUNT_NOT_FOUND (4411)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND);
    expect(hint).toContain('virtual_account');
    expect(hint).toContain('standard');
  });

  test('returns hint for INSUFFICIENT_FUNDS (4415)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS);
    expect(hint).toContain('Пополните');
  });

  test('returns hint for REFUND_ERROR (4422)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.REFUND_ERROR);
    expect(hint).toContain('Повторите позже');
  });

  test('returns hint for COMPLIANCE_ERROR (4436)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR);
    expect(hint).toContain('поддержку');
  });

  test('returns hint for RESTRICTIONS_IMPOSED (4558)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.RESTRICTIONS_IMPOSED);
    expect(hint).toContain('комплаенс');
  });

  test('returns hint for IDEMPOTENT_REQUEST_IN_PROCESS (4909)', () => {
    const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS);
    expect(hint).toContain('Дождитесь');
  });

  test('returns null for unknown error code', () => {
    const hint = getErrorUserHint(9999);
    expect(hint).toBeNull();
  });
});

describe('PAYMENT_ERROR_CONFIG', () => {
  test('contains config for VIRTUAL_ACCOUNT_NOT_FOUND (4411)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND];
    expect(config).toBeDefined();
    expect(config.title).toBe('Виртуальный счёт не найден');
    expect(config.message).toContain('virtual_account');
    expect(config.hint).toContain('standard');
    expect(config.actions).toBeDefined();
    expect(config.actions?.[0].kind).toBe('link');
    expect(config.actions?.[0].href).toBe('/virtual-accounts');
  });

  test('contains config for PAYMENT_NOT_FOUND (4412)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND];
    expect(config).toBeDefined();
    expect(config.title).toBe('Платёж не найден');
    expect(config.hint).toContain('Обновите');
  });

  test('contains config for PAYMENT_AMOUNT_MISMATCH (4413)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH];
    expect(config).toBeDefined();
    expect(config.title).toBe('Суммы не совпадают');
    expect(config.message).toContain('owners');
  });

  test('contains config for PAYMENT_ALREADY_IDENTIFIED (4414)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED];
    expect(config).toBeDefined();
    expect(config.title).toBe('Платёж уже идентифицирован');
    expect(config.actions).toBeDefined();
    expect(config.actions?.[0].kind).toBe('refresh');
  });

  test('contains config for REFUND_ERROR (4422)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.REFUND_ERROR];
    expect(config).toBeDefined();
    expect(config.title).toBe('Ошибка возврата платежа');
    expect(config.actions?.[0].kind).toBe('retry');
  });

  test('contains config for COMPLIANCE_ERROR (4436)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR];
    expect(config).toBeDefined();
    expect(config.title).toBe('Ошибка комплаенс-проверки');
    expect(config.actions?.[0].kind).toBe('retry');
  });

  test('contains config for RESTRICTIONS_IMPOSED (4558)', () => {
    const config = PAYMENT_ERROR_CONFIG[CYCLOPS_ERROR_CODES.RESTRICTIONS_IMPOSED];
    expect(config).toBeDefined();
    expect(config.title).toContain('Ограничения');
    expect(config.hint).toContain('комплаенс');
  });
});

describe('getPaymentErrorConfig', () => {
  test('returns config for valid payment error code', () => {
    const config = getPaymentErrorConfig(CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND);
    expect(config).not.toBeNull();
    expect(config?.title).toBe('Платёж не найден');
  });

  test('returns null for unknown error code', () => {
    const config = getPaymentErrorConfig(9999);
    expect(config).toBeNull();
  });

  test('returns null for error code not in PAYMENT_ERROR_CONFIG', () => {
    // BENEFICIARY_NOT_FOUND is in CYCLOPS_ERROR_CODES but not in PAYMENT_ERROR_CONFIG
    const config = getPaymentErrorConfig(CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND);
    expect(config).toBeNull();
  });
});

describe('isPaymentError', () => {
  test('returns true for PAYMENT_NOT_FOUND', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Payment not found',
    };
    expect(isPaymentError(error)).toBe(true);
  });

  test('returns true for PAYMENT_AMOUNT_MISMATCH', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
      message: 'Amount mismatch',
    };
    expect(isPaymentError(error)).toBe(true);
  });

  test('returns true for PAYMENT_ALREADY_IDENTIFIED', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED,
      message: 'Already identified',
    };
    expect(isPaymentError(error)).toBe(true);
  });

  test('returns true for REFUND_ERROR', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.REFUND_ERROR,
      message: 'Refund error',
    };
    expect(isPaymentError(error)).toBe(true);
  });

  test('returns true for COMPLIANCE_ERROR', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR,
      message: 'Compliance error',
    };
    expect(isPaymentError(error)).toBe(true);
  });

  test('returns false for VIRTUAL_ACCOUNT_NOT_FOUND', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND,
      message: 'VA not found',
    };
    expect(isPaymentError(error)).toBe(false);
  });

  test('returns false for BENEFICIARY_NOT_FOUND', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND,
      message: 'Beneficiary not found',
    };
    expect(isPaymentError(error)).toBe(false);
  });

  test('returns false for unknown error code', () => {
    const error: CyclopsError = {
      code: 9999,
      message: 'Unknown error',
    };
    expect(isPaymentError(error)).toBe(false);
  });
});

describe('isInsufficientFundsError', () => {
  test('returns true for INSUFFICIENT_FUNDS error', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS,
      message: 'Insufficient funds',
    };
    expect(isInsufficientFundsError(error)).toBe(true);
  });

  test('returns false for other errors', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Not found',
    };
    expect(isInsufficientFundsError(error)).toBe(false);
  });
});

describe('isAccountNotFoundError', () => {
  test('returns true for VIRTUAL_ACCOUNT_NOT_FOUND error', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND,
      message: 'Account not found',
    };
    expect(isAccountNotFoundError(error)).toBe(true);
  });

  test('returns false for other errors', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Payment not found',
    };
    expect(isAccountNotFoundError(error)).toBe(false);
  });
});

describe('isBeneficiaryError', () => {
  test('returns true for BENEFICIARY_NOT_FOUND error', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND,
      message: 'Beneficiary not found',
    };
    expect(isBeneficiaryError(error)).toBe(true);
  });

  test('returns true for BENEFICIARY_NOT_ACTIVE error', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_ACTIVE,
      message: 'Beneficiary not active',
    };
    expect(isBeneficiaryError(error)).toBe(true);
  });

  test('returns false for other errors', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Payment not found',
    };
    expect(isBeneficiaryError(error)).toBe(false);
  });
});

describe('shouldShowIdempotencyUI', () => {
  test('returns true for IDEMPOTENT_REQUEST_IN_PROCESS error', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS,
      message: 'Request in process',
    };
    expect(shouldShowIdempotencyUI(error)).toBe(true);
  });

  test('returns false for other errors', () => {
    const error: CyclopsError = {
      code: CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND,
      message: 'Payment not found',
    };
    expect(shouldShowIdempotencyUI(error)).toBe(false);
  });
});

describe('createLogEntry', () => {
  test('creates log entry with correct fields', () => {
    const entry = createLogEntry(
      'req-123',
      'list_payments_v2',
      'prod',
      { page: 1, per_page: 100 },
      true,
      150
    );

    expect(entry.requestId).toBe('req-123');
    expect(entry.method).toBe('list_payments_v2');
    expect(entry.layer).toBe('prod');
    expect(entry.success).toBe(true);
    expect(entry.durationMs).toBe(150);
    expect(entry.timestamp).toBeDefined();
  });

  test('includes error info when provided', () => {
    const error: CyclopsError = {
      code: 4412,
      message: 'Payment not found',
    };
    const entry = createLogEntry(
      'req-123',
      'get_payment',
      'pre',
      { payment_id: '550e8400-e29b-41d4-a716-446655440000' },
      false,
      100,
      error
    );

    expect(entry.success).toBe(false);
    expect(entry.errorCode).toBe(4412);
    expect(entry.errorMessage).toBe('Payment not found');
  });

  test('masks sensitive data in params', () => {
    const entry = createLogEntry(
      'req-123',
      'refund_virtual_account',
      'prod',
      {
        account: '40702810123456789012',
        bank_code: '044525225',
        inn: '1234567890',
      },
      true,
      200
    );

    // Params should be masked
    expect(entry.params.account).toBe('****9012');
    expect(entry.params.bank_code).toBe('****5225');
    expect(entry.params.inn).toBe('12****90');
  });

  test('generates ISO timestamp', () => {
    const entry = createLogEntry(
      'req-123',
      'list_payments_v2',
      'prod',
      {},
      true,
      100
    );

    // Should be valid ISO date string
    expect(() => new Date(entry.timestamp)).not.toThrow();
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });
});

describe('CYCLOPS_ERROR_MESSAGES mapping', () => {
  test('maps 4409 to "Бенефициар не найден"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4409]).toBe('Бенефициар не найден');
  });

  test('maps 4410 to "Бенефициар не активен"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4410]).toBe('Бенефициар не активен');
  });

  test('maps 4411 to "Виртуальный счёт не найден"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4411]).toBe('Виртуальный счёт не найден');
  });

  test('maps 4412 to "Платёж не найден"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4412]).toBe('Платёж не найден');
  });

  test('maps 4413 to "Суммы не совпадают"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4413]).toBe('Суммы не совпадают');
  });

  test('maps 4414 to "Платёж уже идентифицирован"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4414]).toBe('Платёж уже идентифицирован');
  });

  test('maps 4415 to "Недостаточно средств на виртуальном счёте"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4415]).toBe('Недостаточно средств на виртуальном счёте');
  });

  test('maps 4422 to "Ошибка возврата платежа"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4422]).toBe('Ошибка возврата платежа');
  });

  test('maps 4436 to "Ошибка комплаенс-проверки"', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4436]).toBe('Ошибка комплаенс-проверки');
  });

  test('maps 4558 to restrictions message', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4558]).toContain('Ограничения');
  });

  test('maps 4909 to idempotent request message', () => {
    expect(CYCLOPS_ERROR_MESSAGES[4909]).toContain('ext_key');
  });
});
