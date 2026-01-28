import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { Layer } from '@/types/cyclops';

export const runtime = 'nodejs';

const ENDPOINTS: Record<Layer, string> = {
  pre: 'https://pre.tochka.com/api/v1/cyclops/upload_document/beneficiary',
  prod: 'https://api.tochka.com/api/v1/cyclops/upload_document/beneficiary',
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

const getContentType = (file: File) => {
  if (file.type) {
    return file.type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return '';
};

const signBinary = (body: Buffer, privateKey: string) => {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(body);
  return sign.sign(privateKey, 'base64').replace(/[\r\n]/g, '');
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const layer = String(formData.get('layer') || '');
    if (!layer || !['pre', 'prod'].includes(layer)) {
      return NextResponse.json({ error: 'Invalid layer. Must be "pre" or "prod"' }, { status: 400 });
    }

    const beneficiaryId = String(formData.get('beneficiary_id') || '');
    const documentType = String(formData.get('document_type') || '');
    const documentDate = String(formData.get('document_date') || '');
    const documentNumber = String(formData.get('document_number') || '');
    const file = formData.get('file');

    if (!beneficiaryId || beneficiaryId === 'undefined') {
      return NextResponse.json({ error: 'beneficiary_id required' }, { status: 400 });
    }
    if (!documentType) {
      return NextResponse.json({ error: 'document_type required' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    const contentType = getContentType(file);
    if (!contentType) {
      return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 400 });
    }

    const keys = await loadKeysConfig(layer);
    if (!keys) {
      return NextResponse.json({ error: 'Конфигурация ключей не найдена. Настройте ключи в разделе Настройки.' }, { status: 400 });
    }

    const bodyBuffer = Buffer.from(await file.arrayBuffer());
    const signature = signBinary(bodyBuffer, keys.privateKey);

    const query = new URLSearchParams({
      beneficiary_id: beneficiaryId,
      document_type: documentType,
    });
    if (documentDate) {
      query.set('document_date', documentDate);
    }
    if (documentNumber) {
      query.set('document_number', documentNumber);
    }

    const endpoint = `${ENDPOINTS[layer as Layer]}?${query.toString()}`;
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
      const errorMessage =
        (payload && typeof payload === 'object' && 'error' in payload && String((payload as { error?: unknown }).error)) ||
        (payload && typeof payload === 'object' && 'message' in payload && String((payload as { message?: unknown }).message)) ||
        (payload && typeof payload === 'object' && 'raw' in payload && String((payload as { raw?: unknown }).raw)) ||
        `HTTP ${response.status}`;
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    return NextResponse.json(payload || {});
  } catch (error) {
    console.error('Upload document error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
