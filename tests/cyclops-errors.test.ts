/**
 * Unit тесты для обработки ошибок Cyclops
 * Запуск: npx tsx tests/cyclops-errors.test.ts
 */

import assert from 'assert';
import {
  processCyclopsError,
  getErrorUserHint,
  isInsufficientFundsError,
  isAccountNotFoundError,
  isBeneficiaryError,
  shouldShowIdempotencyUI,
  createLogEntry,
} from '../lib/cyclops-errors';
import { CYCLOPS_ERROR_CODES, type CyclopsError } from '../types/cyclops';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(`  ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log('\n=== Тесты обработки ошибок Cyclops ===\n');

// processCyclopsError
test('processCyclopsError: маппит код 4411 в userMessage', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND,
    message: 'Virtual account not found',
  };
  const result = processCyclopsError(error);
  assert.strictEqual(result.userMessage, 'Виртуальный счёт не найден');
  assert.strictEqual(result.code, 4411);
});

test('processCyclopsError: маппит код 4415 в userMessage', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS,
    message: 'Insufficient funds',
  };
  const result = processCyclopsError(error);
  assert.strictEqual(result.userMessage, 'Недостаточно средств на виртуальном счёте');
});

test('processCyclopsError: определяет isIdempotentInProcess для 4909', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS,
    message: 'Request in process',
  };
  const result = processCyclopsError(error);
  assert.strictEqual(result.isIdempotentInProcess, true);
});

test('processCyclopsError: isRetryable для 5xx ошибок', () => {
  const error: CyclopsError = {
    code: 500,
    message: 'Internal server error',
  };
  const result = processCyclopsError(error);
  assert.strictEqual(result.isRetryable, true);
});

test('processCyclopsError: не isRetryable для клиентских ошибок', () => {
  const error: CyclopsError = {
    code: 4411,
    message: 'Not found',
  };
  const result = processCyclopsError(error);
  assert.strictEqual(result.isRetryable, false);
});

test('processCyclopsError: использует message если код не известен', () => {
  const error: CyclopsError = {
    code: 9999,
    message: 'Custom error message',
  };
  const result = processCyclopsError(error);
  assert.strictEqual(result.userMessage, 'Custom error message');
});

test('processCyclopsError: включает data в debugMessage', () => {
  const error: CyclopsError = {
    code: 4411,
    message: 'Error',
    data: { field: 'value' },
  };
  const result = processCyclopsError(error);
  assert.ok(result.debugMessage.includes('field'));
});

// getErrorUserHint
test('getErrorUserHint: возвращает подсказку для 4411', () => {
  const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND);
  assert.ok(hint !== null);
  assert.ok(hint!.includes('Проверьте'));
});

test('getErrorUserHint: возвращает подсказку для 4909', () => {
  const hint = getErrorUserHint(CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS);
  assert.ok(hint !== null);
  assert.ok(hint!.includes('Дождитесь'));
});

test('getErrorUserHint: возвращает null для неизвестного кода', () => {
  const hint = getErrorUserHint(9999);
  assert.strictEqual(hint, null);
});

// isInsufficientFundsError
test('isInsufficientFundsError: возвращает true для 4415', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS,
    message: 'Insufficient funds',
  };
  assert.strictEqual(isInsufficientFundsError(error), true);
});

test('isInsufficientFundsError: возвращает false для других кодов', () => {
  const error: CyclopsError = {
    code: 4411,
    message: 'Not found',
  };
  assert.strictEqual(isInsufficientFundsError(error), false);
});

// isAccountNotFoundError
test('isAccountNotFoundError: возвращает true для 4411', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND,
    message: 'Not found',
  };
  assert.strictEqual(isAccountNotFoundError(error), true);
});

// isBeneficiaryError
test('isBeneficiaryError: возвращает true для 4409', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND,
    message: 'Not found',
  };
  assert.strictEqual(isBeneficiaryError(error), true);
});

test('isBeneficiaryError: возвращает true для 4410', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_ACTIVE,
    message: 'Not active',
  };
  assert.strictEqual(isBeneficiaryError(error), true);
});

// shouldShowIdempotencyUI
test('shouldShowIdempotencyUI: возвращает true для 4909', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS,
    message: 'In process',
  };
  assert.strictEqual(shouldShowIdempotencyUI(error), true);
});

test('shouldShowIdempotencyUI: возвращает false для других кодов', () => {
  const error: CyclopsError = {
    code: 4411,
    message: 'Not found',
  };
  assert.strictEqual(shouldShowIdempotencyUI(error), false);
});

// createLogEntry
test('createLogEntry: создаёт корректную запись лога', () => {
  const entry = createLogEntry(
    'test-id',
    'refund_virtual_account',
    'pre',
    { virtual_account: 'abc', recipient: { account: '40702810000000000001', inn: '7707083893' } },
    true,
    150
  );

  assert.strictEqual(entry.requestId, 'test-id');
  assert.strictEqual(entry.method, 'refund_virtual_account');
  assert.strictEqual(entry.layer, 'pre');
  assert.strictEqual(entry.success, true);
  assert.strictEqual(entry.durationMs, 150);
  assert.ok(entry.timestamp);
});

test('createLogEntry: маскирует чувствительные данные в params', () => {
  const entry = createLogEntry(
    'test-id',
    'refund_virtual_account',
    'pre',
    { account: '40702810000000000001', inn: '7707083893' },
    true,
    150
  );

  assert.strictEqual(entry.params.account, '****0001');
  assert.strictEqual(entry.params.inn, '77****93');
});

test('createLogEntry: включает информацию об ошибке', () => {
  const error: CyclopsError = {
    code: 4411,
    message: 'Not found',
  };
  const entry = createLogEntry(
    'test-id',
    'get_virtual_account',
    'pre',
    {},
    false,
    100,
    error
  );

  assert.strictEqual(entry.success, false);
  assert.strictEqual(entry.errorCode, 4411);
  assert.strictEqual(entry.errorMessage, 'Not found');
});

// Итоги
console.log(`\n=== Результаты: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
