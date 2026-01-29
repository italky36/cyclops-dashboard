import { NextRequest, NextResponse } from 'next/server';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';

interface RouteContext {
  params: Promise<{ dealId: string }>;
}

// POST /api/deals/[dealId]/compliance — проверка комплаенс
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const layer = getLayerFromRequest(request);
    const { dealId } = await context.params;

    const client = await getCyclopsClient(layer);
    const result = await client.call('compliance_check_deal', {
      deal_id: dealId,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка проверки' },
      { status: 500 }
    );
  }
}
