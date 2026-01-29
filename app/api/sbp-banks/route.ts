import { NextRequest, NextResponse } from 'next/server';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';

export async function GET(request: NextRequest) {
  try {
    const layer = getLayerFromRequest(request);
    const client = await getCyclopsClient(layer);
    const result = await client.call('list_bank_sbp', {});

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    const banks = Array.isArray(result.result)
      ? result.result
      : Array.isArray((result.result as { banks?: unknown[] } | undefined)?.banks)
        ? (result.result as { banks?: unknown[] }).banks
        : [];

    return NextResponse.json({ banks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка загрузки банков СБП' },
      { status: 500 }
    );
  }
}
