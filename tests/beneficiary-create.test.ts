/**
 * Unit тесты для создания бенефициаров F/I и проверки статуса
 * Запуск: npx tsx tests/beneficiary-create.test.ts
 */

import assert from 'assert';
import {
  buildCreateBeneficiaryIpParams,
  buildCreateBeneficiaryFlParams,
  buildUpdateBeneficiaryUlParams,
  buildUpdateBeneficiaryIpParams,
  buildUpdateBeneficiaryFlParams,
} from '../lib/beneficiary-requests';
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

console.log('\n=== Тесты создания бенефициаров IP/FL ===\n');

test('buildCreateBeneficiaryIpParams: без номинального счета', () => {
  const params = buildCreateBeneficiaryIpParams({
    inn: '770708389312',
    beneficiary_data: {
      first_name: 'Иван',
      last_name: 'Иванов',
    },
  });

  assert.strictEqual(params.inn, '770708389312');
  assert.strictEqual(params.beneficiary_data.first_name, 'Иван');
  assert.strictEqual(params.beneficiary_data.last_name, 'Иванов');
  assert.strictEqual(typeof params.nominal_account_code, 'undefined');
});

test('buildCreateBeneficiaryFlParams: с номинальным счетом', () => {
  const params = buildCreateBeneficiaryFlParams({
    inn: '770708389312',
    nominal_account_code: '40702810000000000001',
    nominal_account_bic: '044525225',
    beneficiary_data: {
      first_name: 'Иван',
      last_name: 'Иванов',
      birth_date: '1990-01-24',
      birth_place: 'г. Свердловск',
      passport_number: '123456',
      passport_date: '2020-01-01',
      registration_address: 'г. Москва, ул. Примерная, д. 1',
    },
  });

  assert.strictEqual(params.nominal_account_code, '40702810000000000001');
  assert.strictEqual(params.nominal_account_bic, '044525225');
});

test('buildUpdateBeneficiaryUlParams: нормализует КПП и ОГРН', () => {
  const params = buildUpdateBeneficiaryUlParams({
    beneficiary_id: 'test-id',
    beneficiary_data: {
      name: ' ООО "Рога и Копыта" ',
      kpp: '246-301-001',
      ogrn: '1 2 3 4 5 6 7 8 9 0 1 2 3 4 5',
    },
  });

  assert.strictEqual(params.beneficiary_data.name, 'ООО "Рога и Копыта"');
  assert.strictEqual(params.beneficiary_data.kpp, '246301001');
  assert.strictEqual(params.beneficiary_data.ogrn, '123456789012345');
  assert.strictEqual(params.beneficiary_data.is_active_activity, true);
});

test('buildUpdateBeneficiaryIpParams: тримит ФИО и задаёт tax_resident', () => {
  const params = buildUpdateBeneficiaryIpParams({
    beneficiary_id: 'test-id',
    beneficiary_data: {
      first_name: ' Иван ',
      last_name: ' Иванов ',
    },
  });

  assert.strictEqual(params.beneficiary_data.first_name, 'Иван');
  assert.strictEqual(params.beneficiary_data.last_name, 'Иванов');
  assert.strictEqual(params.beneficiary_data.tax_resident, true);
});

test('buildUpdateBeneficiaryFlParams: нормализует паспорт и адрес', () => {
  const params = buildUpdateBeneficiaryFlParams({
    beneficiary_id: 'test-id',
    beneficiary_data: {
      first_name: 'Иван',
      last_name: 'Иванов',
      birth_date: '1990-01-24',
      birth_place: ' г. Свердловск ',
      passport_series: '65 09',
      passport_number: '12 34 56',
      passport_date: '2020-01-01',
      registration_address: ' г. Москва, ул. Примерная ',
    },
  });

  assert.strictEqual(params.beneficiary_data.birth_place, 'г. Свердловск');
  assert.strictEqual(params.beneficiary_data.passport_series, '6509');
  assert.strictEqual(params.beneficiary_data.passport_number, '123456');
  assert.strictEqual(params.beneficiary_data.registration_address, 'г. Москва, ул. Примерная');
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
