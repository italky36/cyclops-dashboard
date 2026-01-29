/**
 * Вспомогательные функции для работы с Cyclops API в API routes
 */

import { NextRequest } from 'next/server';
import { CyclopsClient } from '@/lib/cyclops-client';
import type { Layer } from '@/types/cyclops';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Параметры шифрования (синхронизировано с app/api/cyclops/route.ts)
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

/**
 * Получает Cyclops клиент для указанного слоя
 */
export async function getCyclopsClient(layer: Layer): Promise<CyclopsClient> {
  const config = await loadKeysConfig(layer);

  if (!config) {
    throw new Error(`Конфигурация для слоя ${layer.toUpperCase()} не найдена. Настройте ключи в разделе Настройки.`);
  }

  return new CyclopsClient({
    layer,
    privateKey: config.privateKey,
    signSystem: config.signSystem,
    signThumbprint: config.signThumbprint,
  });
}

/**
 * Извлекает layer из query параметров запроса
 * По умолчанию возвращает 'pre' для безопасности
 */
export function getLayerFromRequest(request: NextRequest): Layer {
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get('layer');
  if (layer === 'prod' || layer === 'pre') {
    return layer;
  }
  return 'pre';
}

/**
 * Обёртка для вызова метода Cyclops API
 */
export async function callCyclops<T = unknown>(
  layer: Layer,
  method: string,
  params: Record<string, unknown> = {}
): Promise<{ result?: T; error?: { code: number; message: string; data?: unknown } }> {
  const client = await getCyclopsClient(layer);
  return client.call<T>(method, params);
}
