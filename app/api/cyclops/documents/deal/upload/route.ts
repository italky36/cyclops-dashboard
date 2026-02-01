import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Layer } from '@/types/cyclops';
import { getLayerFromRequest } from '@/lib/cyclops-helpers';
import {
  MAX_DEAL_DOCUMENT_SIZE_BYTES,
  isAllowedDealDocumentMimeType,
} from '@/lib/cyclops-document-utils';
import {
  DEAL_UPLOAD_ERROR_CODES,
  buildDealUploadUrl,
  normalizeUploadDocumentError,
  uploadDealDocumentQuerySchema,
  uploadDealDocumentSuccessSchema,
} from '@/lib/cyclops-document-upload';

export const runtime = 'nodejs';

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

const buildValidationError = (message: string, code = DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST) =>
  NextResponse.json(
    { error: { code, message } },
    { status: 400 }
  );

export async function POST(request: NextRequest) {
  try {
    const layer = getLayerFromRequest(request);
    const { searchParams } = new URL(request.url);
    const rawParams = {
      beneficiary_id: searchParams.get('beneficiary_id') || '',
      deal_id: searchParams.get('deal_id') || '',
      document_type: searchParams.get('document_type') || '',
      document_date: searchParams.get('document_date') || undefined,
      document_number: searchParams.get('document_number') || undefined,
    };

    const parsed = uploadDealDocumentQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST,
            message: 'Некорректные параметры запроса',
            meta: parsed.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const contentTypeHeader = request.headers.get('content-type');
    const contentType = (contentTypeHeader || '').split(';')[0].trim().toLowerCase();
    if (!contentType) {
      return buildValidationError('Content-Type обязателен');
    }
    if (!isAllowedDealDocumentMimeType(contentType)) {
      return NextResponse.json(
        {
          error: {
            code: DEAL_UPLOAD_ERROR_CODES.NOT_SUPPORTED_CONTENT_TYPE,
            message: 'Not supported Content-Type',
          },
        },
        { status: 415 }
      );
    }

    const bodyBuffer = Buffer.from(await request.arrayBuffer());
    if (!bodyBuffer.length) {
      return buildValidationError('Нет данных файла');
    }
    if (bodyBuffer.length > MAX_DEAL_DOCUMENT_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: {
            code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST,
            message: 'Размер файла превышает 25 МБ',
          },
        },
        { status: 413 }
      );
    }

    const keys = await loadKeysConfig(layer);
    if (!keys) {
      return NextResponse.json(
        { error: { code: DEAL_UPLOAD_ERROR_CODES.NO_VALID_DATA_IN_REQUEST, message: 'Конфигурация ключей не найдена. Настройте ключи в разделе Настройки.' } },
        { status: 400 }
      );
    }

    console.info('[Cyclops Upload Deal Document] request', {
      layer,
      beneficiary_id: parsed.data.beneficiary_id,
      deal_id: parsed.data.deal_id,
      document_type: parsed.data.document_type,
      document_date: parsed.data.document_date,
      document_number: parsed.data.document_number,
      content_type: contentType,
      size_bytes: bodyBuffer.length,
    });

    const signature = signBinary(bodyBuffer, keys.privateKey);
    const endpoint = buildDealUploadUrl(ENDPOINTS[layer], parsed.data);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'sign-data': signature,
        'sign-thumbprint': keys.signThumbprint,
        'sign-system': keys.signSystem,
      },
      body: bodyBuffer,
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
      const normalized = normalizeUploadDocumentError(
        payload,
        response.status,
        `HTTP ${response.status}`
      );
      console.error('[Cyclops Upload Deal Document] error', {
        status: response.status,
        error: normalized.error,
      });
      return NextResponse.json(normalized, { status: response.status });
    }

    const parsedSuccess = uploadDealDocumentSuccessSchema.safeParse(payload);
    if (parsedSuccess.success) {
      console.info('[Cyclops Upload Deal Document] success', {
        document_id: parsedSuccess.data.document_id,
      });
      return NextResponse.json(parsedSuccess.data);
    }

    return NextResponse.json(payload || {});
  } catch (error) {
    console.error('[Cyclops Upload Deal Document] unexpected error', error);
    return NextResponse.json(
      { error: { code: 500, message: error instanceof Error ? error.message : 'Internal server error' } },
      { status: 500 }
    );
  }
}
