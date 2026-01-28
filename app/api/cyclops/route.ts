import { NextRequest, NextResponse } from 'next/server';
import { CyclopsClient } from '@/lib/cyclops-client';
import {
  upsertBeneficiariesFromList,
  upsertBeneficiaryFromDetail,
  getCachedBeneficiariesByIds,
  mapCachedToApi,
} from '@/lib/beneficiaries-cache';
import {
  generateCacheKey,
  shouldCacheMethod,
  getFromCache,
  setInCache,
  getCacheInfo,
  invalidateCacheByMethod,
} from '@/lib/cyclops-cache';
import {
  processCyclopsError,
  createLogEntry,
  logCyclopsRequest,
} from '@/lib/cyclops-errors';
import { createBeneficiarySchema, validateParams } from '@/lib/cyclops-validators';
import type { Layer, GetBeneficiaryResult, ListBeneficiariesResult, JsonRpcResponse, CyclopsError } from '@/types/cyclops';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// Параметры шифрования
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const KEYS_DIR = process.env.KEYS_STORAGE_PATH || './.keys';

const getMasterPassword = () => {
  const password = process.env.KEYS_MASTER_PASSWORD;
  if (!password && process.env.NODE_ENV === 'development') {
    return 'dev-password-change-in-production';
  }
  return password || '';
};

function decrypt(encryptedText: string, password: string): string {
  const buffer = Buffer.from(encryptedText, 'base64');
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

async function loadKeysConfig(layer: string): Promise<{
  privateKey: string;
  signSystem: string;
  signThumbprint: string;
} | null> {
  const password = getMasterPassword();
  try {
    const filePath = path.join(KEYS_DIR, `${layer}.keys.enc`);
    const encrypted = await fs.readFile(filePath, 'utf8');
    const decrypted = decrypt(encrypted, password);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

async function getClient(layer: Layer): Promise<CyclopsClient> {
  // Загружаем конфигурацию из файла
  const config = await loadKeysConfig(layer);
  
  if (!config) {
    throw new Error(`Конфигурация для слоя ${layer.toUpperCase()} не найдена. Настройте ключи в разделе Настройки.`);
  }

  // Создаём новый клиент (или используем кэшированный если конфиг не изменился)
  return new CyclopsClient({
    layer,
    privateKey: config.privateKey,
    signSystem: config.signSystem,
    signThumbprint: config.signThumbprint,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { layer, method, params } = body as {
      layer: Layer;
      method: string;
      params?: Record<string, unknown>;
    };

    // Валидация
    if (!layer || !['pre', 'prod'].includes(layer)) {
      return NextResponse.json(
        { error: 'Invalid layer. Must be "pre" or "prod"' },
        { status: 400 }
      );
    }

    if (!method) {
      return NextResponse.json(
        { error: 'Method is required' },
        { status: 400 }
      );
    }

    // Безопасность: проверяем разрешённые методы
    const allowedMethods = [
      // Бенефициары
      'create_beneficiary',
      'create_beneficiary_ul',
      'create_beneficiary_ip',
      'create_beneficiary_fl',
      'update_beneficiary_ul',
      'update_beneficiary_ip',
      'update_beneficiary_fl',
      'get_beneficiary',
      'list_beneficiary',
      'activate_beneficiary',
      'deactivate_beneficiary',
      'get_beneficiary_restrictions',
      // Виртуальные счета
      'create_virtual_account',
      'get_virtual_account',
      'list_virtual_account',
      'list_virtual_transaction',
      'refund_virtual_account',
      'transfer_between_virtual_accounts',
      'transfer_between_virtual_accounts_v2',
      'get_virtual_accounts_transfer',
      // Сделки
      'create_deal',
      'update_deal',
      'get_deal',
      'list_deals',
      'execute_deal',
      'rejected_deal',
      'cancel_deal_with_executed_recipients',
      'compliance_check_deal',
      // Платежи
      'list_payments',
      'list_payments_v2',
      'get_payment',
      'identification_payment',
      'refund_payment',
      'identification_returned_payment_by_deal',
      'compliance_check_payment',
      'payment_of_taxes',
      'generate_payment_order',
      // СБП
      'list_bank_sbp',
      'generate_sbp_qrcode',
      // Документы
      'upload_document',
      'get_document',
      'list_documents',
      // Утилиты
      'echo',
    ];

    if (!allowedMethods.includes(method)) {
      return NextResponse.json(
        { error: `Method "${method}" is not allowed` },
        { status: 403 }
      );
    }

    let effectiveParams = params || {};
    if (method === 'create_beneficiary') {
      const validation = validateParams(createBeneficiarySchema, params || {});
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation error', details: validation.errors },
          { status: 400 }
        );
      }
      effectiveParams = validation.data;
    }

    // Методы, которые инвалидируют кеш
    const cacheInvalidatingMethods: Record<string, string[]> = {
      'create_virtual_account': ['list_virtual_account'],
      'refund_virtual_account': ['get_virtual_account', 'list_virtual_transaction'],
      'transfer_between_virtual_accounts': ['get_virtual_account', 'list_virtual_transaction'],
      'transfer_between_virtual_accounts_v2': ['get_virtual_account', 'list_virtual_transaction'],
      'create_beneficiary': ['list_beneficiary'],
      'create_beneficiary_ul': ['list_beneficiary'],
      'create_beneficiary_ip': ['list_beneficiary'],
      'create_beneficiary_fl': ['list_beneficiary'],
      'activate_beneficiary': ['list_beneficiary', 'get_beneficiary'],
      'deactivate_beneficiary': ['list_beneficiary', 'get_beneficiary'],
    };

    const requestId = uuidv4();
    const startTime = Date.now();

    // Проверяем кеш для rate-limited методов
    const cacheKey = generateCacheKey(method, layer, effectiveParams);
    let fromCache = false;

    if (shouldCacheMethod(method)) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        fromCache = true;
        const cacheInfo = getCacheInfo(cacheKey);

        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_CYCLOPS === '1') {
          console.info('[Cyclops API] cache hit', {
            layer,
            method,
            cacheInfo,
          });
        }

        return NextResponse.json({
          ...cached.data,
          _cache: cacheInfo,
        });
      }
    }

    if (process.env.NODE_ENV === 'development' || process.env.DEBUG_CYCLOPS === '1') {
      console.info('[Cyclops API] request', {
        requestId,
        layer,
        method,
        fromCache,
      });
    }

    // Получаем клиент и выполняем запрос
    const client = await getClient(layer);
    const result = await client.call(method, effectiveParams);

    // Логируем запрос
    const durationMs = Date.now() - startTime;
    const logEntry = createLogEntry(
      requestId,
      method,
      layer,
      effectiveParams,
      !result.error,
      durationMs,
      result.error as CyclopsError | undefined
    );
    logCyclopsRequest(logEntry);

    // Кешируем успешные ответы для rate-limited методов
    if (!result.error && shouldCacheMethod(method)) {
      setInCache(cacheKey, result);
    }

    // Инвалидируем связанный кеш при мутациях
    const methodsToInvalidate = cacheInvalidatingMethods[method];
    if (methodsToInvalidate && !result.error) {
      for (const m of methodsToInvalidate) {
        invalidateCacheByMethod(m, layer);
      }
    }

    if (method === 'list_beneficiary') {
      try {
        const typed = result as JsonRpcResponse<ListBeneficiariesResult>;
        const list = typed.result?.beneficiaries;
        if (Array.isArray(list)) {
          upsertBeneficiariesFromList(list);
          const ids = list
            .map((b) => String(b.id || b.beneficiary_id || ''))
            .filter((id) => id && id !== 'undefined');
          const cached = getCachedBeneficiariesByIds(ids);
          if (typed.result) {
            typed.result.beneficiaries = mapCachedToApi(list, cached);
          }
        }
      } catch (cacheError) {
        console.error('[Cyclops API] cache list_beneficiary failed:', cacheError);
      }
    }

    if (method === 'get_beneficiary') {
      try {
        const typed = result as JsonRpcResponse<GetBeneficiaryResult>;
        const detail = typed.result?.beneficiary;
        if (detail) {
          upsertBeneficiaryFromDetail(detail);
        }
      } catch (cacheError) {
        console.error('[Cyclops API] cache get_beneficiary failed:', cacheError);
      }
    }

    if (result?.error) {
      // Обрабатываем ошибку Cyclops
      const processedError = processCyclopsError(result.error as CyclopsError);

      if (process.env.NODE_ENV === 'development' || process.env.DEBUG_CYCLOPS === '1') {
        console.info('[Cyclops API] response error', {
          requestId,
          layer,
          method,
          error: result.error,
          processedError,
        });
      }

      // Добавляем обработанную информацию об ошибке в ответ
      return NextResponse.json({
        ...result,
        _errorInfo: {
          userMessage: processedError.userMessage,
          isRetryable: processedError.isRetryable,
          isIdempotentInProcess: processedError.isIdempotentInProcess,
        },
      });
    }

    // Добавляем информацию о кеше в ответ
    const cacheInfo = shouldCacheMethod(method) ? getCacheInfo(cacheKey) : null;
    return NextResponse.json({
      ...result,
      _cache: cacheInfo,
    });
  } catch (error) {
    console.error('Cyclops API error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}

// Получение списка доступных методов
export async function GET() {
  return NextResponse.json({
    methods: {
      beneficiaries: [
        'create_beneficiary',
        'create_beneficiary_ul',
        'create_beneficiary_ip',
        'create_beneficiary_fl',
        'get_beneficiary',
        'list_beneficiary',
        'activate_beneficiary',
        'deactivate_beneficiary',
      ],
      virtual_accounts: [
        'create_virtual_account',
        'get_virtual_account',
        'list_virtual_account',
        'list_virtual_transaction',
        'refund_virtual_account',
        'transfer_between_virtual_accounts',
        'transfer_between_virtual_accounts_v2',
        'get_virtual_accounts_transfer',
      ],
      deals: [
        'create_deal',
        'update_deal',
        'get_deal',
        'list_deals',
        'execute_deal',
        'rejected_deal',
      ],
      payments: [
        'list_payments_v2',
        'get_payment',
        'identification_payment',
        'refund_payment',
      ],
      sbp: [
        'list_bank_sbp',
        'generate_sbp_qrcode',
      ],
    },
    layers: ['pre', 'prod'],
    cache: {
      ttlMs: 5 * 60 * 1000,
      rateLimitedMethods: [
        'list_virtual_account',
        'get_virtual_account',
        'list_virtual_transaction',
        'list_beneficiary',
        'get_beneficiary',
      ],
    },
  });
}
