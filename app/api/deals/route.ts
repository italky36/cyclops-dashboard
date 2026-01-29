import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';
import { listDealsParamsSchema, createDealParamsSchema } from '@/lib/validators/deals';
import type { ListDealsParams, DealStatus } from '@/types/cyclops/deals';

// GET /api/deals — список сделок
export async function GET(request: NextRequest) {
  try {
    const layer = getLayerFromRequest(request);
    const { searchParams } = new URL(request.url);

    const params: ListDealsParams = {
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      per_page: searchParams.get('per_page') ? Number(searchParams.get('per_page')) : 50,
      field_names: ['status', 'amount', 'created_at', 'updated_at', 'ext_key'],
      filters: {},
    };

    // Собираем фильтры
    const status = searchParams.get('status');
    const ext_key = searchParams.get('ext_key');
    const created_date_from = searchParams.get('created_date_from');
    const created_date_to = searchParams.get('created_date_to');
    const updated_at_from = searchParams.get('updated_at_from');
    const updated_at_to = searchParams.get('updated_at_to');

    if (status) params.filters!.status = status as DealStatus;
    if (ext_key) params.filters!.ext_key = ext_key;
    if (created_date_from) params.filters!.created_date_from = created_date_from;
    if (created_date_to) params.filters!.created_date_to = created_date_to;
    if (updated_at_from) params.filters!.updated_at_from = updated_at_from;
    if (updated_at_to) params.filters!.updated_at_to = updated_at_to;

    // Удаляем пустой объект filters
    if (Object.keys(params.filters!).length === 0) {
      delete params.filters;
    }

    const validated = listDealsParamsSchema.parse(params);
    const client = await getCyclopsClient(layer);
    const result = await client.call('list_deals', validated);

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
      { error: error instanceof Error ? error.message : 'Ошибка загрузки сделок' },
      { status: 500 }
    );
  }
}

// POST /api/deals — создание сделки
export async function POST(request: NextRequest) {
  try {
    const layer = getLayerFromRequest(request);
    const body = await request.json();
    const validated = createDealParamsSchema.parse(body);

    const client = await getCyclopsClient(layer);
    const result = await client.call('create_deal', validated);

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message, code: result.error.code },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ошибка валидации', details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка создания сделки' },
      { status: 500 }
    );
  }
}
