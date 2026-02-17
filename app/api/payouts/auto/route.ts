import { NextRequest, NextResponse } from 'next/server';
import { getClientsForAutoPayout } from '@/lib/clients';
import { executeAutoPayoutForClient, type AutoPayoutResult } from '@/lib/auto-payout';
import { logAction } from '@/lib/vending';
import { getLayerFromRequest } from '@/lib/cyclops-helpers';

/**
 * POST /api/payouts/auto?layer=pre
 *
 * Эндпоинт для автоматических выплат. Вызывается внешним кроном.
 * Проверяет всех клиентов с auto_payout_enabled и next_payout_at <= сегодня,
 * выполняет расчёт и создание/исполнение сделок через Cyclops.
 *
 * Авторизация: Bearer <AUTO_PAYOUT_SECRET>
 */
export async function POST(request: NextRequest) {
  try {
    // Проверяем авторизацию
    const expectedToken = process.env.AUTO_PAYOUT_SECRET;
    if (expectedToken) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${expectedToken}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const layer = getLayerFromRequest(request);
    const today = new Date().toISOString().split('T')[0];

    // Получаем клиентов, для которых подошло время автовыплаты
    const clients = getClientsForAutoPayout(today);

    if (clients.length === 0) {
      logAction('auto_payout_run', 'auto_payout', null, JSON.stringify({
        date: today,
        layer,
        total_clients: 0,
        message: 'Нет клиентов для автовыплаты',
      }));

      return NextResponse.json({
        success: true,
        message: 'Нет клиентов для автовыплаты',
        results: [],
        summary: { total: 0, successful: 0, skipped: 0, failed: 0 },
      });
    }

    // Обрабатываем каждого клиента последовательно
    const results: AutoPayoutResult[] = [];

    for (const client of clients) {
      const clientResult = await executeAutoPayoutForClient(client.id, layer);
      results.push(clientResult);
    }

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success && r.payout_id).length,
      skipped: results.filter(r => r.success && !r.payout_id).length,
      failed: results.filter(r => !r.success).length,
    };

    logAction('auto_payout_run', 'auto_payout', null, JSON.stringify({
      date: today,
      layer,
      ...summary,
      failed_clients: results.filter(r => !r.success).map(r => ({
        client_id: r.client_id,
        client_name: r.client_name,
        error: r.error,
      })),
    }));

    return NextResponse.json({
      success: true,
      results,
      summary,
    });
  } catch (error) {
    console.error('[Auto Payout] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка автовыплат' },
      { status: 500 }
    );
  }
}
