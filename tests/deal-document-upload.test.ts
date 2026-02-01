/**
 * Unit тесты для загрузки документов по сделкам
 * Запуск: npx tsx tests/deal-document-upload.test.ts
 */

import assert from 'assert';
import {
  MAX_DEAL_DOCUMENT_SIZE_BYTES,
  validateDealDocumentFile,
} from '../lib/cyclops-document-utils';
import {
  buildDealUploadUrl,
  normalizeUploadDocumentError,
} from '../lib/cyclops-document-upload';

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

console.log('\n=== Тесты upload документов сделки ===\n');

// validateDealDocumentFile
test('validateDealDocumentFile: принимает PDF до 25 МБ', () => {
  const result = validateDealDocumentFile({
    name: 'agreement.pdf',
    type: 'application/pdf',
    size: 5 * 1024 * 1024,
  });
  assert.strictEqual(result, null);
});

test('validateDealDocumentFile: отклоняет размер больше 25 МБ', () => {
  const result = validateDealDocumentFile({
    name: 'big.pdf',
    type: 'application/pdf',
    size: MAX_DEAL_DOCUMENT_SIZE_BYTES + 1,
  });
  assert.strictEqual(result, 'Размер файла не должен превышать 25 МБ');
});

test('validateDealDocumentFile: отклоняет неподдерживаемый MIME', () => {
  const result = validateDealDocumentFile({
    name: 'note.txt',
    type: 'text/plain',
    size: 1024,
  });
  assert.strictEqual(result, 'Поддерживаемые форматы: PDF, GIF, JPG, PNG, TIFF, BMP');
});

// buildDealUploadUrl
test('buildDealUploadUrl: формирует query для upload_document/deal', () => {
  const url = buildDealUploadUrl('https://example.com/upload', {
    beneficiary_id: '11111111-1111-1111-1111-111111111111',
    deal_id: '22222222-2222-2222-2222-222222222222',
    document_type: 'service_agreement',
    document_date: '2025-01-31',
    document_number: 'SA-01',
  });
  assert.strictEqual(
    url,
    'https://example.com/upload?beneficiary_id=11111111-1111-1111-1111-111111111111&deal_id=22222222-2222-2222-2222-222222222222&document_type=service_agreement&document_date=2025-01-31&document_number=SA-01'
  );
});

// normalizeUploadDocumentError
test('normalizeUploadDocumentError: сохраняет код/сообщение/мета', () => {
  const normalized = normalizeUploadDocumentError(
    { error: { code: 4402, message: 'Not supported Content-Type', meta: { field: 'Content-Type' } } },
    400
  );
  assert.deepStrictEqual(normalized, {
    error: {
      code: 4402,
      message: 'Not supported Content-Type',
      meta: { field: 'Content-Type' },
    },
  });
});

test('normalizeUploadDocumentError: использует fallback для строковой ошибки', () => {
  const normalized = normalizeUploadDocumentError({ error: 'Bad request' }, 400);
  assert.deepStrictEqual(normalized, {
    error: {
      code: 400,
      message: 'Bad request',
    },
  });
});

// Итоги
console.log(`\n=== Результаты: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
