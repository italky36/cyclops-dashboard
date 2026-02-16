import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Layer } from '@/types/cyclops';
import { MAX_DEAL_DOCUMENT_SIZE_BYTES, isAllowedDealDocumentMimeType } from '@/lib/cyclops-document-utils';
import {
  DEAL_UPLOAD_ERROR_CODES,
  buildDealUploadUrl,
  normalizeUploadDocumentError,
  uploadDealDocumentSuccessSchema,
} from '@/lib/cyclops-document-upload';

const ENDPOINTS: Record<Layer, string> = {
  pre: 'https://pre.tochka.com/api/v1/cyclops/upload_document/deal',
  prod: 'https://api.tochka.com/api/v1/cyclops/upload_document/deal',
};

// Параметры шифрования (должны совпадать с /api/cyclops)
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

const signBinary = (body: Buffer, privateKey: string) => {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(body);
  return sign.sign(privateKey, 'base64').replace(/[\r\n]/g, '');
};

export async function uploadDealDocumentBinary(params: {
  layer: Layer;
  beneficiary_id: string;
  deal_id: string;
  document_type: string;
  document_date: string;
  document_number: string;
  contentType: string;
  body: Buffer;
}): Promise<
  | { ok: true; data: { document_id: string } }
  | { ok: false; error: { code: number; message: string; meta?: unknown } }
> {
  const contentType = (params.contentType || '').split(';')[0].trim().toLowerCase();
  if (!contentType) {
    return { ok: false, error: { code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST, message: 'Content-Type обязателен' } };
  }
  if (!isAllowedDealDocumentMimeType(contentType)) {
    return { ok: false, error: { code: DEAL_UPLOAD_ERROR_CODES.NOT_SUPPORTED_CONTENT_TYPE, message: 'Not supported Content-Type' } };
  }
  if (!params.body || params.body.length === 0) {
    return { ok: false, error: { code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST, message: 'Нет данных файла' } };
  }
  if (params.body.length > MAX_DEAL_DOCUMENT_SIZE_BYTES) {
    return { ok: false, error: { code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST, message: 'Размер файла превышает 25 МБ' } };
  }

  const keys = await loadKeysConfig(params.layer);
  if (!keys) {
    return { ok: false, error: { code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST, message: 'Конфигурация ключей не найдена. Настройте ключи в разделе Настройки.' } };
  }

  const signature = signBinary(params.body, keys.privateKey);
  const endpoint = buildDealUploadUrl(ENDPOINTS[params.layer], {
    beneficiary_id: params.beneficiary_id,
    deal_id: params.deal_id,
    document_type: params.document_type,
    document_date: params.document_date,
    document_number: params.document_number,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'sign-data': signature,
      'sign-thumbprint': keys.signThumbprint,
      'sign-system': keys.signSystem,
    },
    body: params.body as unknown as BodyInit,
  });

  const rawText = await response.text();
  let payload: unknown = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { raw: rawText };
    }
  }

  if (!response.ok) {
    const normalized = normalizeUploadDocumentError(payload, response.status, `HTTP ${response.status}`);
    return { ok: false, error: normalized.error };
  }

  const parsedSuccess = uploadDealDocumentSuccessSchema.safeParse(payload);
  if (parsedSuccess.success) {
    return { ok: true, data: parsedSuccess.data };
  }

  return { ok: true, data: { document_id: '' } };
}
