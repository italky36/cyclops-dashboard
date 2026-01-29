import { NextRequest, NextResponse } from 'next/server';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';

interface RouteContext {
  params: Promise<{ dealId: string }>;
}

// POST /api/deals/[dealId]/execute — исполнение сделки
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const layer = getLayerFromRequest(request);
    const { dealId } = await context.params;
    const body = await request.json().catch(() => ({}));

    const executeParams: Record<string, unknown> = { deal_id: dealId };

    // Частичное исполнение — если указаны конкретные получатели
    if (body.recipients_execute && Array.isArray(body.recipients_execute)) {
      executeParams.recipients_execute = body.recipients_execute;
    }

    const client = await getCyclopsClient(layer);
    const result = await client.call('execute_deal', executeParams);

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка исполнения' },
      { status: 500 }
    );
  }
}
