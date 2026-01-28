/**
 * Unit тесты для валидаторов Cyclops
 * Запуск: npx tsx tests/cyclops-validators.test.ts
 */

import assert from 'assert';
import {
  amountSchema,
  accountNumberSchema,
  bankCodeSchema,
  innSchema,
  kppSchema,
  documentNumberSchema,
  purposeSchema,
  identifierSchema,
  dateSchema,
  uuidSchema,
  virtualAccountTypeSchema,
  operationTypeSchema,
  legalTypeSchema,
  isInnOptionalForAccount,
  validateParams,
  maskSensitiveData,
  formatAmount,
  refundVirtualAccountSchema,
} from '../lib/cyclops-validators';

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

console.log('\n=== Тесты валидаторов Cyclops ===\n');

// amountSchema
test('amountSchema: принимает положительные числа', () => {
  assert.strictEqual(amountSchema.parse(100), 100);
  assert.strictEqual(amountSchema.parse(0.01), 0.01);
  assert.strictEqual(amountSchema.parse(99.99), 99.99);
});

test('amountSchema: отклоняет отрицательные числа', () => {
  const result = amountSchema.safeParse(-1);
  assert.strictEqual(result.success, false);
});

test('amountSchema: отклоняет более 2 знаков после запятой', () => {
  const result = amountSchema.safeParse(1.123);
  assert.strictEqual(result.success, false);
});

// accountNumberSchema
test('accountNumberSchema: принимает 20 цифр', () => {
  const result = accountNumberSchema.safeParse('40702810000000000001');
  assert.strictEqual(result.success, true);
});

test('accountNumberSchema: отклоняет менее 20 цифр', () => {
  const result = accountNumberSchema.safeParse('4070281000000000000');
  assert.strictEqual(result.success, false);
});

test('accountNumberSchema: отклоняет буквы', () => {
  const result = accountNumberSchema.safeParse('4070281000000000000a');
  assert.strictEqual(result.success, false);
});

// bankCodeSchema
test('bankCodeSchema: принимает 9 цифр', () => {
  const result = bankCodeSchema.safeParse('044525225');
  assert.strictEqual(result.success, true);
});

test('bankCodeSchema: отклоняет менее 9 цифр', () => {
  const result = bankCodeSchema.safeParse('04452522');
  assert.strictEqual(result.success, false);
});

// innSchema
test('innSchema: принимает 10 цифр (ЮЛ)', () => {
  const result = innSchema.safeParse('7707083893');
  assert.strictEqual(result.success, true);
});

test('innSchema: принимает 12 цифр (ФЛ)', () => {
  const result = innSchema.safeParse('770708389312');
  assert.strictEqual(result.success, true);
});

test('innSchema: отклоняет 11 цифр', () => {
  const result = innSchema.safeParse('77070838931');
  assert.strictEqual(result.success, false);
});

// kppSchema
test('kppSchema: принимает 9 цифр', () => {
  const result = kppSchema.safeParse('770701001');
  assert.strictEqual(result.success, true);
});

test('kppSchema: принимает undefined (опционально)', () => {
  const result = kppSchema.safeParse(undefined);
  assert.strictEqual(result.success, true);
});

// documentNumberSchema
test('documentNumberSchema: принимает до 6 символов', () => {
  assert.strictEqual(documentNumberSchema.safeParse('123456').success, true);
  assert.strictEqual(documentNumberSchema.safeParse('ABC').success, true);
});

test('documentNumberSchema: отклоняет более 6 символов', () => {
  const result = documentNumberSchema.safeParse('1234567');
  assert.strictEqual(result.success, false);
});

// purposeSchema
test('purposeSchema: принимает до 210 символов', () => {
  const result = purposeSchema.safeParse('Оплата по договору №123');
  assert.strictEqual(result.success, true);
});

test('purposeSchema: отклоняет более 210 символов', () => {
  const result = purposeSchema.safeParse('a'.repeat(211));
  assert.strictEqual(result.success, false);
});

// identifierSchema
test('identifierSchema: принимает 1-60 символов', () => {
  assert.strictEqual(identifierSchema.safeParse('A').success, true);
  assert.strictEqual(identifierSchema.safeParse('ID-12345').success, true);
  assert.strictEqual(identifierSchema.safeParse('Идентификатор№1').success, true);
});

test('identifierSchema: отклоняет более 60 символов', () => {
  const result = identifierSchema.safeParse('a'.repeat(61));
  assert.strictEqual(result.success, false);
});

// dateSchema
test('dateSchema: принимает YYYY-MM-DD', () => {
  assert.strictEqual(dateSchema.safeParse('2024-01-15').success, true);
  assert.strictEqual(dateSchema.safeParse('2024-12-31').success, true);
});

test('dateSchema: отклоняет неверный формат', () => {
  assert.strictEqual(dateSchema.safeParse('15-01-2024').success, false);
  assert.strictEqual(dateSchema.safeParse('2024/01/15').success, false);
});

// uuidSchema
test('uuidSchema: принимает UUID', () => {
  const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
  assert.strictEqual(result.success, true);
});

test('uuidSchema: отклоняет неверный UUID', () => {
  const result = uuidSchema.safeParse('not-a-uuid');
  assert.strictEqual(result.success, false);
});

// virtualAccountTypeSchema
test('virtualAccountTypeSchema: принимает standard и for_ndfl', () => {
  assert.strictEqual(virtualAccountTypeSchema.safeParse('standard').success, true);
  assert.strictEqual(virtualAccountTypeSchema.safeParse('for_ndfl').success, true);
});

test('virtualAccountTypeSchema: отклоняет другие значения', () => {
  const result = virtualAccountTypeSchema.safeParse('other');
  assert.strictEqual(result.success, false);
});

// operationTypeSchema
test('operationTypeSchema: принимает все типы операций', () => {
  const types = ['cash_add', 'block_add', 'block_add_from_cash', 'cash_add_from_block', 'block_write_off', 'cash_write_off'];
  for (const type of types) {
    assert.strictEqual(operationTypeSchema.safeParse(type).success, true, `Должен принять ${type}`);
  }
});

// legalTypeSchema
test('legalTypeSchema: принимает F, I, J', () => {
  assert.strictEqual(legalTypeSchema.safeParse('F').success, true);
  assert.strictEqual(legalTypeSchema.safeParse('I').success, true);
  assert.strictEqual(legalTypeSchema.safeParse('J').success, true);
});

// isInnOptionalForAccount
test('isInnOptionalForAccount: возвращает true для счетов физлиц', () => {
  assert.strictEqual(isInnOptionalForAccount('40817810000000000001'), true);
  assert.strictEqual(isInnOptionalForAccount('42301810000000000001'), true);
  assert.strictEqual(isInnOptionalForAccount('40820810000000000001'), true);
});

test('isInnOptionalForAccount: возвращает false для счетов ЮЛ', () => {
  assert.strictEqual(isInnOptionalForAccount('40702810000000000001'), false);
  assert.strictEqual(isInnOptionalForAccount('40701810000000000001'), false);
});

// maskSensitiveData
test('maskSensitiveData: маскирует account', () => {
  const result = maskSensitiveData({ account: '40702810000000000001' });
  assert.strictEqual(result.account, '****0001');
});

test('maskSensitiveData: маскирует bank_code', () => {
  const result = maskSensitiveData({ bank_code: '044525225' });
  assert.strictEqual(result.bank_code, '****5225');
});

test('maskSensitiveData: маскирует inn', () => {
  const result = maskSensitiveData({ inn: '7707083893' });
  assert.strictEqual(result.inn, '77****93');
});

test('maskSensitiveData: маскирует вложенные объекты', () => {
  const result = maskSensitiveData({
    recipient: { account: '40702810000000000001', inn: '7707083893' },
  });
  const recipient = result.recipient as Record<string, unknown>;
  assert.strictEqual(recipient.account, '****0001');
  assert.strictEqual(recipient.inn, '77****93');
});

// formatAmount
test('formatAmount: округляет до 2 знаков', () => {
  assert.strictEqual(formatAmount(1.234), 1.23);
  assert.strictEqual(formatAmount(1.235), 1.24);
  assert.strictEqual(formatAmount(100), 100);
});

// validateParams
test('validateParams: возвращает success для корректных данных', () => {
  const result = validateParams(amountSchema, 100);
  assert.strictEqual(result.success, true);
  if (result.success) {
    assert.strictEqual(result.data, 100);
  }
});

test('validateParams: возвращает errors для некорректных данных', () => {
  const result = validateParams(accountNumberSchema, '123');
  assert.strictEqual(result.success, false);
  if (!result.success) {
    assert.ok(result.errors.length > 0);
  }
});

// Итоги
console.log(`\n=== Результаты: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
