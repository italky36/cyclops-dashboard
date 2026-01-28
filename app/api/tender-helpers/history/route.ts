import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse, createSuccessResponse } from '@/lib/api-response';
import { listTenderHelpersPayments } from '@/lib/tender-helpers';

function getLayer(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return searchParams.get('layer') || request.headers.get('x-layer');
}

function isPreLayer(layer: string | null) {
  return layer === 'pre';
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

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get('limit') || '20', 10);
  const recipient_account = searchParams.get('recipient_account');
  const recipient_bank_code = searchParams.get('recipient_bank_code');

  try {
    const history = listTenderHelpersPayments({
      limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
      recipient_account: recipient_account || null,
      recipient_bank_code: recipient_bank_code || null,
    });

    return NextResponse.json(createSuccessResponse(history));
  } catch (error) {
    return NextResponse.json(
      createErrorResponse({
        title: 'Ошибка загрузки истории',
        message: error instanceof Error ? error.message : 'Не удалось получить историю платежей.',
      }),
      { status: 500 }
    );
  }
}
