import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';
import { updateDealParamsSchema } from '@/lib/validators/deals';

interface RouteContext {
  params: Promise<{ dealId: string }>;
}

// GET /api/deals/[dealId] — детали сделки
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const layer = getLayerFromRequest(request);
    const { dealId } = await context.params;

    const client = await getCyclopsClient(layer);
    const result = await client.call('get_deal', { deal_id: dealId });

    if (result.error) {
      const status = result.error.code === 4417 ? 404 : 400;
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Сделка не найдена' },
      { status: 500 }
    );
  }
}

// PUT /api/deals/[dealId] — обновление сделки
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const layer = getLayerFromRequest(request);
    const { dealId } = await context.params;
    const body = await request.json();

    const updateParams = {
      deal_id: dealId,
      deal_data: body,
    };

    const validated = updateDealParamsSchema.parse(updateParams);
    const client = await getCyclopsClient(layer);
    const result = await client.call('update_deal', validated);

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ошибка валидации', details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка обновления' },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[dealId] — отмена сделки (статус new)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const layer = getLayerFromRequest(request);
    const { dealId } = await context.params;

    const client = await getCyclopsClient(layer);
    const result = await client.call('rejected_deal', { deal_id: dealId });

    if (result.error) {
      // Код 4418 = "Операция невозможна с текущим статусом"
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка отмены' },
      { status: 500 }
    );
  }
}
