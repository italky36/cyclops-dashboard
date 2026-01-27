import { NextRequest, NextResponse } from 'next/server';
import { CyclopsClient } from '@/lib/cyclops-client';
import type { Layer } from '@/types/cyclops';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {
  listCachedBeneficiaries,
  upsertBeneficiariesFromList,
  upsertBeneficiaryFromDetail,
  getBeneficiariesLastSyncAt,
} from '@/lib/beneficiaries-cache';
import type { GetBeneficiaryResult, ListBeneficiariesResult } from '@/types/cyclops';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;
const KEYS_DIR = process.env.KEYS_STORAGE_PATH || './.keys';
const MIN_LIST_REFRESH_MS = 5 * 60 * 1000;

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
  const config = await loadKeysConfig(layer);
  if (!config) {
    throw new Error(`Конфигурация для слоя ${layer.toUpperCase()} не найдена.`);
  }
  return new CyclopsClient({
    layer,
    privateKey: config.privateKey,
    signSystem: config.signSystem,
    signThumbprint: config.signThumbprint,
  });
}

export async function GET() {
  return NextResponse.json({ beneficiaries: listCachedBeneficiaries() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || '');
    const layer = (body?.layer || 'pre') as Layer;

    if (action === 'refresh_list') {
      const lastSync = getBeneficiariesLastSyncAt();
      const now = Date.now();
      if (lastSync && now - lastSync < MIN_LIST_REFRESH_MS) {
        return NextResponse.json({
          skipped: true,
          beneficiaries: listCachedBeneficiaries(),
        });
      }

      const client = await getClient(layer);
      const response = await client.call<ListBeneficiariesResult>('list_beneficiary', {
        page: 1,
        per_page: 100,
        filters: body?.filters || {},
      });

      const list = response?.result?.beneficiaries;
      if (Array.isArray(list)) {
        upsertBeneficiariesFromList(list);
      }

      return NextResponse.json({
        success: true,
        beneficiaries: listCachedBeneficiaries(),
      });
    }

    if (action === 'refresh_one') {
      const beneficiary_id = String(body?.beneficiary_id || '');
      if (!beneficiary_id || beneficiary_id === 'undefined') {
        return NextResponse.json({ error: 'beneficiary_id required' }, { status: 400 });
      }

      const client = await getClient(layer);
      const response = await client.call<GetBeneficiaryResult>('get_beneficiary', { beneficiary_id });
      const detail = response?.result?.beneficiary;
      if (detail) {
        upsertBeneficiaryFromDetail(detail);
      }

      return NextResponse.json({
        success: true,
        beneficiary_id,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
