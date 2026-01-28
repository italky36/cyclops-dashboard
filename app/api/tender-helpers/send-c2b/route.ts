import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-response';
import { getTenderHelpersConfig } from '@/lib/tender-helpers';

const sendC2BSchema = z.object({
  base_url: z.string().url('Base URL должен быть корректным URL').optional(),
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  qrc_id: z.string().min(1, 'QRC ID обязателен'),
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

  const parsed = sendC2BSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Некорректные данные',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }),
      { status: 400 }
    );
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

  const baseUrl = parsed.data.base_url || config.base_url;
  if (!baseUrl) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Base URL не задан',
        message: 'Укажите базовый URL Tender-Helpers.',
      }),
      { status: 400 }
    );
  }

  const requestId = uuidv4();
  const endpoint = baseUrl.endsWith('/jsonrpc')
    ? baseUrl
    : `${baseUrl.replace(/\/$/, '')}/jsonrpc`;
  const rpcBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'send_c2b_credit_transfer_request',
    params: {
      amount: parsed.data.amount,
      qrc_id: parsed.data.qrc_id,
      qrc_type: '02',
      creditor_bank_id: '100000000284',
    },
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
          message: payloadJson.error?.message || 'Не удалось выполнить send_c2b_credit_transfer_request.',
        }),
        { status: 400 }
      );
    }

    const result = payloadJson?.result || payloadJson;
    return NextResponse.json(
      createSuccessResponse({
        transaction_id: result?.transaction_id ?? null,
        hint: 'Это transaction_id, а не payment_id.',
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
