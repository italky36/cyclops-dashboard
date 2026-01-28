/**
 * Unit тесты для кеша Cyclops
 * Запуск: npx tsx tests/cyclops-cache.test.ts
 */

import assert from 'assert';
import {
  generateCacheKey,
  shouldCacheMethod,
  getFromCache,
  setInCache,
  invalidateCache,
  invalidateCacheByMethod,
  clearCache,
  getCacheStats,
  getCacheInfo,
  getCacheTimeRemaining,
  isCachedResponse,
} from '../lib/cyclops-cache';

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

// Очищаем кеш перед тестами
clearCache();

console.log('\n=== Тесты кеша Cyclops ===\n');

// generateCacheKey
test('generateCacheKey: генерирует уникальные ключи', () => {
  const key1 = generateCacheKey('list_virtual_account', 'pre', { page: 1 });
  const key2 = generateCacheKey('list_virtual_account', 'pre', { page: 2 });
  const key3 = generateCacheKey('list_virtual_account', 'prod', { page: 1 });

  assert.notStrictEqual(key1, key2);
  assert.notStrictEqual(key1, key3);
});

test('generateCacheKey: одинаковые параметры дают одинаковый ключ', () => {
  const key1 = generateCacheKey('get_virtual_account', 'pre', { virtual_account: 'abc' });
  const key2 = generateCacheKey('get_virtual_account', 'pre', { virtual_account: 'abc' });

  assert.strictEqual(key1, key2);
});

test('generateCacheKey: порядок ключей не влияет на результат', () => {
  const key1 = generateCacheKey('list_virtual_account', 'pre', { a: 1, b: 2 });
  const key2 = generateCacheKey('list_virtual_account', 'pre', { b: 2, a: 1 });

  assert.strictEqual(key1, key2);
});

// shouldCacheMethod
test('shouldCacheMethod: возвращает true для rate-limited методов', () => {
  assert.strictEqual(shouldCacheMethod('list_virtual_account'), true);
  assert.strictEqual(shouldCacheMethod('get_virtual_account'), true);
  assert.strictEqual(shouldCacheMethod('list_virtual_transaction'), true);
  assert.strictEqual(shouldCacheMethod('list_beneficiary'), true);
  assert.strictEqual(shouldCacheMethod('get_beneficiary'), true);
});

test('shouldCacheMethod: возвращает false для мутаций', () => {
  assert.strictEqual(shouldCacheMethod('create_virtual_account'), false);
  assert.strictEqual(shouldCacheMethod('refund_virtual_account'), false);
  assert.strictEqual(shouldCacheMethod('transfer_between_virtual_accounts'), false);
});

// setInCache / getFromCache
test('setInCache/getFromCache: сохраняет и возвращает данные', () => {
  clearCache();
  const cacheKey = 'test:key:1';
  const data = { result: { value: 'test' }, jsonrpc: '2.0' as const, id: '1' };

  setInCache(cacheKey, data);
  const cached = getFromCache(cacheKey);

  assert.ok(cached !== null);
  assert.deepStrictEqual(cached!.data, data);
});

test('getFromCache: возвращает null для несуществующего ключа', () => {
  clearCache();
  const cached = getFromCache('nonexistent:key');
  assert.strictEqual(cached, null);
});

test('getFromCache: возвращает null для истёкшего кеша', () => {
  clearCache();
  const cacheKey = 'test:expired:key';
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  // Устанавливаем кеш с TTL 1ms
  setInCache(cacheKey, data, 1);

  // Ждём истечения
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      const cached = getFromCache(cacheKey);
      assert.strictEqual(cached, null);
      resolve();
    }, 10);
  });
});

// invalidateCache
test('invalidateCache: удаляет конкретный ключ', () => {
  clearCache();
  const cacheKey = 'test:invalidate:key';
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  setInCache(cacheKey, data);
  assert.ok(getFromCache(cacheKey) !== null);

  invalidateCache(cacheKey);
  assert.strictEqual(getFromCache(cacheKey), null);
});

// invalidateCacheByMethod
test('invalidateCacheByMethod: удаляет все ключи метода', () => {
  clearCache();
  const key1 = 'pre:list_virtual_account:{"page":1}';
  const key2 = 'pre:list_virtual_account:{"page":2}';
  const key3 = 'pre:get_virtual_account:{"id":"abc"}';
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  setInCache(key1, data);
  setInCache(key2, data);
  setInCache(key3, data);

  invalidateCacheByMethod('list_virtual_account', 'pre');

  assert.strictEqual(getFromCache(key1), null);
  assert.strictEqual(getFromCache(key2), null);
  assert.ok(getFromCache(key3) !== null); // не удалён
});

// getCacheStats
test('getCacheStats: возвращает статистику', () => {
  clearCache();
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  setInCache('stats:key:1', data);
  getFromCache('stats:key:1'); // hit
  getFromCache('stats:key:1'); // hit
  getFromCache('stats:nonexistent'); // miss

  const stats = getCacheStats();
  assert.ok(stats.hits >= 2);
  assert.ok(stats.misses >= 1);
  assert.ok(stats.size >= 1);
});

// getCacheInfo
test('getCacheInfo: возвращает информацию о закешированном ключе', () => {
  clearCache();
  const cacheKey = 'info:test:key';
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  setInCache(cacheKey, data);
  const info = getCacheInfo(cacheKey);

  assert.strictEqual(info.cached, true);
  assert.ok(info.cachedAt);
  assert.ok(info.expiresAt);
  assert.ok(typeof info.remainingMs === 'number');
});

test('getCacheInfo: возвращает cached: false для несуществующего ключа', () => {
  clearCache();
  const info = getCacheInfo('nonexistent:key');
  assert.strictEqual(info.cached, false);
});

// getCacheTimeRemaining
test('getCacheTimeRemaining: возвращает оставшееся время', () => {
  clearCache();
  const cacheKey = 'remaining:test:key';
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  setInCache(cacheKey, data, 60000); // 1 минута
  const remaining = getCacheTimeRemaining(cacheKey);

  assert.ok(remaining !== null);
  assert.ok(remaining! > 0);
  assert.ok(remaining! <= 60000);
});

test('getCacheTimeRemaining: возвращает null для несуществующего ключа', () => {
  clearCache();
  const remaining = getCacheTimeRemaining('nonexistent:key');
  assert.strictEqual(remaining, null);
});

// isCachedResponse
test('isCachedResponse: возвращает true для закешированного ключа', () => {
  clearCache();
  const cacheKey = 'iscached:test:key';
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };

  setInCache(cacheKey, data);
  assert.strictEqual(isCachedResponse(cacheKey), true);
});

test('isCachedResponse: возвращает false для несуществующего ключа', () => {
  clearCache();
  assert.strictEqual(isCachedResponse('nonexistent:key'), false);
});

// clearCache
test('clearCache: очищает весь кеш', () => {
  const data = { result: {}, jsonrpc: '2.0' as const, id: '1' };
  setInCache('clear:key:1', data);
  setInCache('clear:key:2', data);

  clearCache();

  assert.strictEqual(getFromCache('clear:key:1'), null);
  assert.strictEqual(getFromCache('clear:key:2'), null);
  assert.strictEqual(getCacheStats().size, 0);
});

// Итоги
console.log(`\n=== Результаты: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
