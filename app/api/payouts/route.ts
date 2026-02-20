import { NextRequest, NextResponse } from 'next/server';
import {
  getPayoutById,
  getPayoutHistory,
  getPayoutDetails,
  getPayoutSchedule,
  updatePayoutSchedule,
} from '@/lib/vending';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    // Получение истории выплат
    if (action === 'history') {
      const beneficiary_id = searchParams.get('beneficiary_id') || undefined;
      const client_id = searchParams.get('client_id') || undefined;
      const status = searchParams.get('status') || undefined;
      const date_from = searchParams.get('date_from') || undefined;
      const date_to = searchParams.get('date_to') || undefined;

      const payouts = getPayoutHistory({
        beneficiary_id,
        client_id: client_id ? parseInt(client_id, 10) : undefined,
        status,
        date_from,
        date_to,
      });
      return NextResponse.json({ payouts });
    }

    // Получение деталей выплаты
    if (action === 'details') {
      const payout_id = searchParams.get('payout_id');
      if (!payout_id) {
        return NextResponse.json({ error: 'payout_id required' }, { status: 400 });
      }

      const payout = getPayoutById(parseInt(payout_id, 10));
      if (!payout) {
        return NextResponse.json({ error: 'Payout not found' }, { status: 404 });
      }

      const details = getPayoutDetails(payout.id);
      return NextResponse.json({ payout, details });
    }

    // Получение настроек расписания
    if (action === 'schedule') {
      const schedule = getPayoutSchedule();
      return NextResponse.json({ schedule });
    }

    return NextResponse.json({
      actions: ['history', 'details', 'schedule'],
    });
  } catch (error) {
    console.error('[Payouts API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // Обновление настроек расписания
    if (action === 'update_schedule') {
      const { cron_expression, is_enabled, updated_by } = body;

      if (cron_expression === undefined && is_enabled === undefined) {
        return NextResponse.json(
          { error: 'cron_expression or is_enabled required' },
          { status: 400 }
        );
      }

      const currentSchedule = getPayoutSchedule();
      const schedule = updatePayoutSchedule({
        cron_expression: cron_expression ?? currentSchedule?.cron_expression ?? '0 0 1 * *',
        is_enabled: is_enabled ?? currentSchedule?.is_enabled ?? false,
        updated_by,
      });

      return NextResponse.json({
        success: true,
        schedule,
      });
    }

    return NextResponse.json(
      { error: 'Unknown action. Available: update_schedule. Расчёт выплат — через /api/clients/[clientId]/payout' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Payouts API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
