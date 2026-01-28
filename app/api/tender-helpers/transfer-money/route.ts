import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationError,
} from '@/lib/api-response';
import {
  getTenderHelpersConfig,
  getDefaultTenderHelpersPayer,
} from '@/lib/tender-helpers';

const transferSchema = z.object({
  base_url: z.string().url('Base URL должен быть корректным URL').optional(),
  recipient_account: z.string().regex(/^\d{20}$/, 'Счёт получателя должен содержать 20 цифр').optional(),
  recipient_bank_code: z.string().regex(/^\d{9}$/, 'БИК получателя должен содержать 9 цифр').optional(),
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  purpose: z.string().max(210, 'Назначение должно быть не длиннее 210 символов').optional(),
  payer_account: z.string().regex(/^\d{20}$/, 'Счёт плательщика должен содержать 20 цифр').optional(),
  payer_bank_code: z.string().regex(/^\d{9}$/, 'БИК плательщика должен содержать 9 цифр').optional(),
});

function getLayer(request: NextRequest, bodyLayer?: string | null) {
  const { searchParams } = new URL(request.url);
  return bodyLayer || searchParams.get('layer') || request.headers.get('x-layer');
}

function isPreLayer(layer: string | null) {
  return layer === 'pre';
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

  const parsed = transferSchema.safeParse(payload);
  if (!parsed.success) {
    const validation = createValidationError(parsed.error.issues.map((issue) => issue.message));
    return NextResponse.json(createErrorResponse(validation), { status: 400 });
  }

  const config = getTenderHelpersConfig();
  if (!config.configured) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Конфигурация не настроена',
        message: 'Сначала заполните настройки Tender-Helpers.',
      }),
      { status: 400 }
    );
  }

  const defaultPayer = getDefaultTenderHelpersPayer(config.test_payers);

  const baseUrl = parsed.data.base_url || config.base_url;
  const recipient_account = parsed.data.recipient_account || config.recipient_account;
  const recipient_bank_code = parsed.data.recipient_bank_code || config.recipient_bank_code;
  const payer_account = parsed.data.payer_account || defaultPayer?.payer_account || null;
  const payer_bank_code = parsed.data.payer_bank_code || defaultPayer?.payer_bank_code || null;

  if (!baseUrl || !recipient_account || !recipient_bank_code || !payer_account || !payer_bank_code) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Недостаточно данных',
        message: 'Проверьте настройки получателя и плательщика.',
      }),
      { status: 400 }
    );
  }

  const requestId = uuidv4();
  const endpoint = baseUrl.endsWith('/jsonrpc')
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}/jsonrpc`;
  const params: Record<string, unknown> = {
    recipient_account,
    recipient_bank_code,
    amount: parsed.data.amount,
  };

  if (parsed.data.purpose) {
    params.purpose = parsed.data.purpose;
  }

  if (payer_account) {
    params.payer_account = payer_account;
  }
  if (payer_bank_code) {
    params.payer_bank_code = payer_bank_code;
  }

  const rpcBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'transfer_money',
    params,
    id: requestId,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sign-data': '12345',
      },
      body: rpcBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        createErrorResponse({
          title: 'Ошибка Tender-Helpers',
          message: text || `HTTP ${response.status}: ${response.statusText}`,
        }),
        { status: response.status }
      );
    }

    const payloadJson = await response.json();
    if (payloadJson?.error) {
      return NextResponse.json(
        createErrorResponse({
          title: 'Ошибка Tender-Helpers',
          message: payloadJson.error?.message || 'Не удалось выполнить transfer_money.',
        }),
        { status: 400 }
      );
    }

    const result = payloadJson?.result || payloadJson;

    return NextResponse.json(
      createSuccessResponse({
        status: result?.status ?? null,
        service_pay_key: result?.service_pay_key ?? null,
      }, { requestId })
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        createErrorResponse({
          title: 'Таймаут запроса',
          message: 'Tender-Helpers не ответили вовремя. Попробуйте ещё раз.',
        }),
        { status: 504 }
      );
    }

    return NextResponse.json(
      createErrorResponse({
        title: 'Ошибка сети',
        message: error instanceof Error ? error.message : 'Не удалось выполнить запрос.',
      }),
      { status: 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
