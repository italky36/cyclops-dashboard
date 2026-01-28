import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationError,
} from '@/lib/api-response';
import { getTenderHelpersConfig, saveTenderHelpersConfig } from '@/lib/tender-helpers';

const payerSchema = z.object({
  payer_bank_code: z.string().regex(/^\d{9}$/, 'БИК плательщика должен содержать 9 цифр'),
  payer_account: z.string().regex(/^\d{20}$/, 'Счёт плательщика должен содержать 20 цифр'),
  is_default: z.boolean(),
});

const configSchema = z.object({
  base_url: z.string().url('Base URL должен быть корректным URL'),
  recipient_account: z.string().regex(/^\d{20}$/, 'Счёт получателя должен содержать 20 цифр'),
  recipient_bank_code: z.string().regex(/^\d{9}$/, 'БИК получателя должен содержать 9 цифр'),
  test_payers: z.array(payerSchema).min(1, 'Добавьте хотя бы одного тестового плательщика'),
});

function getLayer(request: NextRequest, bodyLayer?: string | null) {
  const { searchParams } = new URL(request.url);
  return bodyLayer || searchParams.get('layer') || request.headers.get('x-layer');
}

function isPreLayer(layer: string | null) {
  return layer === 'pre';
}

function mapFieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  error.issues.forEach((issue) => {
    const path = issue.path.join('.') || 'form';
    fields[path] = issue.message;
  });
  return fields;
}

export async function GET(request: NextRequest) {
  const layer = getLayer(request);
  if (!isPreLayer(layer)) {
    return NextResponse.json(
      createErrorResponse({
        code: 'FORBIDDEN',
        title: 'Доступ запрещён',
        message: 'Tender-Helpers доступны только на PRE.',
      }),
      { status: 403 }
    );
  }

  try {
    const config = getTenderHelpersConfig();
    return NextResponse.json(createSuccessResponse(config));
  } catch (error) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Ошибка загрузки',
        message: error instanceof Error ? error.message : 'Не удалось загрузить конфигурацию Tender-Helpers.',
      }),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      createErrorResponse({
        title: 'Некорректный запрос',
        message: 'Тело запроса должно быть JSON.',
      }),
      { status: 400 }
    );
  }

  const { layer, ...payload } = (body || {}) as { layer?: string } & Record<string, unknown>;
  if (!isPreLayer(getLayer(request, layer || null))) {
    return NextResponse.json(
      createErrorResponse({
        code: 'FORBIDDEN',
        title: 'Доступ запрещён',
        message: 'Tender-Helpers доступны только на PRE.',
      }),
      { status: 403 }
    );
  }

  const parsed = configSchema.safeParse(payload);
  if (!parsed.success) {
    const fields = mapFieldErrors(parsed.error);
    const validation = createValidationError(parsed.error.issues.map((issue) => issue.message));
    return NextResponse.json({ ...createErrorResponse(validation), fields }, { status: 400 });
  }

  const defaultCount = parsed.data.test_payers.filter((payer) => payer.is_default).length;
  if (defaultCount !== 1) {
    return NextResponse.json(
      {
        ...createErrorResponse(
          createValidationError(['Должен быть выбран ровно один плательщик по умолчанию'])
        ),
        fields: { test_payers: 'Выберите ровно одного плательщика по умолчанию' },
      },
      { status: 400 }
    );
  }

  try {
    saveTenderHelpersConfig(parsed.data);
    const config = getTenderHelpersConfig();
    return NextResponse.json(createSuccessResponse(config));
  } catch (error) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Ошибка сохранения',
        message: error instanceof Error ? error.message : 'Не удалось сохранить конфигурацию Tender-Helpers.',
      }),
      { status: 500 }
    );
  }
}
