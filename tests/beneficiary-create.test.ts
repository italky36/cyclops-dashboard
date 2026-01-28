/**
 * Unit тесты для создания бенефициаров F/I и проверки статуса
 * Запуск: npx tsx tests/beneficiary-create.test.ts
 */

import assert from 'assert';
import { buildCreateBeneficiaryParams } from '../lib/beneficiary-requests';
import { getStatusCheckWindow } from '../lib/beneficiary-status';
import { accountNumberSchema, bankCodeSchema, inn12Schema } from '../lib/cyclops-validators';
import { processCyclopsError } from '../lib/cyclops-errors';
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

console.log('\n=== Тесты создания бенефициаров F/I ===\n');

test('buildCreateBeneficiaryParams: F без nominal_accoun_data', () => {
  const params = buildCreateBeneficiaryParams({
    legal_type: 'F',
    inn: '770708389312',
    registration_address: 'г. Москва, ул. Примерная, д. 1',
  });

  assert.strictEqual(params.legal_type, 'F');
  assert.strictEqual(params.inn, '770708389312');
  assert.strictEqual(params.beneficiary_data.registration_address, 'г. Москва, ул. Примерная, д. 1');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(params, 'nominal_accoun_data'), false);
});

test('buildCreateBeneficiaryParams: I с nominal_accoun_data', () => {
  const params = buildCreateBeneficiaryParams({
    legal_type: 'I',
    inn: '770708389312',
    registration_address: 'г. Москва, ул. Примерная, д. 1',
    nominal_account_code: '40702810000000000001',
    nominal_account_bic: '044525225',
  });

  assert.strictEqual(params.legal_type, 'I');
  assert.deepStrictEqual(params.nominal_accoun_data, {
    code: '40702810000000000001',
    bic: '044525225',
  });
});

test('inn12Schema: принимает 12 цифр', () => {
  const result = inn12Schema.safeParse('770708389312');
  assert.strictEqual(result.success, true);
});

test('inn12Schema: отклоняет 10 цифр', () => {
  const result = inn12Schema.safeParse('7707083893');
  assert.strictEqual(result.success, false);
});

test('accountNumberSchema: принимает 20 цифр', () => {
  const result = accountNumberSchema.safeParse('40702810000000000001');
  assert.strictEqual(result.success, true);
});

test('bankCodeSchema: отклоняет 8 цифр', () => {
  const result = bankCodeSchema.safeParse('04452522');
  assert.strictEqual(result.success, false);
});

test('getStatusCheckWindow: блокирует повторную проверку раньше 5 минут', () => {
  const now = Date.now();
  const window = getStatusCheckWindow(now - 60 * 1000, now);
  assert.strictEqual(window.allowed, false);
  assert.ok(window.remainingMs > 0);
});

test('getStatusCheckWindow: разрешает проверку после 5 минут', () => {
  const now = Date.now();
  const window = getStatusCheckWindow(now - 6 * 60 * 1000, now);
  assert.strictEqual(window.allowed, true);
});

test('processCyclopsError: возвращает userMessage для JSON-RPC error', () => {
  const error: CyclopsError = {
    code: CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND,
    message: 'Beneficiary not found',
  };
  const result = processCyclopsError(error);
  assert.ok(result.userMessage.length > 0);
});

console.log(`\nPassed: ${passed}, Failed: ${failed}\n`);
if (failed > 0) {
  process.exit(1);
}
