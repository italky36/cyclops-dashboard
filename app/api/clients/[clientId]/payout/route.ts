import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createVendistaClient, isVendistaConfigured } from '@/lib/vendista';
import {
  getClientById,
  getMachinesByClient,
  calculateClientPayout,
  createClientPayout,
  buildDealParamsForClient,
  getPlatformSettings,
} from '@/lib/clients';
import { updatePayoutStatus } from '@/lib/vending';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';

// POST /api/clients/[clientId]/payout — расчёт или выполнение выплаты
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseInt(clientId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const body = await request.json();
    const { action, end_date, user_id } = body;

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    // Получаем машины клиента
    const machines = getMachinesByClient(id);
    if (machines.length === 0) {
      return NextResponse.json({
        calculation: {
          client_id: id,
          client_name: client.name,
          period_start: end_date || new Date().toISOString().split('T')[0],
          period_end: end_date || new Date().toISOString().split('T')[0],
          machines: [],
          total_sales: 0,
          total_commission: 0,
          payout_amount: 0,
        },
        message: 'У клиента нет привязанных автоматов',
      });
    }

    // Получаем транзакции из Vendista
    let transactions: Array<{ id: string | number; machine_id: string | number; date: string; amount: number }> = [];

    if (isVendistaConfigured()) {
      const vendistaClient = createVendistaClient();
      const terminal_ids = machines
        .map(m => m.terminal_id)
        .filter((tid): tid is string => tid !== null && tid !== undefined);

      if (terminal_ids.length > 0) {
        const endDate = end_date || new Date().toISOString().split('T')[0];
        const startDate = machines.reduce((earliest, m) => {
          const assignedDate = m.assigned_at.split('T')[0];
          return assignedDate < earliest ? assignedDate : earliest;
        }, endDate);

        transactions = await vendistaClient.fetchTransactionsForMachines({
          terminal_ids,
          startDate,
          endDate,
        });
      }
    }

    const calculation = calculateClientPayout(id, transactions, end_date);

    // Только расчёт (preview)
    if (action === 'calculate') {
      return NextResponse.json({
        calculation,
        transactions_count: transactions.length,
      });
    }

    // Выполнение выплаты через Cyclops Deal
    if (action === 'execute') {
      if (calculation.payout_amount <= 0) {
        return NextResponse.json(
          { error: 'Нет суммы к выплате', calculation },
          { status: 400 }
        );
      }

      // Проверяем настройки платформы
      const settings = getPlatformSettings();
      if (!settings.payout_virtual_account) {
        return NextResponse.json(
          { error: 'Не настроен виртуальный счёт платформы для выплат. Укажите его в Настройках → Платформа.' },
          { status: 400 }
        );
      }

      // Создаём локальную запись о выплате
      const payout = createClientPayout(calculation, user_id);
      updatePayoutStatus(payout.id, 'processing');

      // Формируем назначение платежа
      const period = `${calculation.period_start} — ${calculation.period_end}`;
      const purpose = settings.payout_purpose_template.replace('{period}', period);

      // Формируем ext_key для идемпотентности
      const extKey = `payout_${payout.id}_${uuidv4().slice(0, 8)}`;

      // Формируем параметры deal
      const dealParams = buildDealParamsForClient(
        client,
        settings.payout_virtual_account,
        calculation.payout_amount,
        purpose,
        extKey
      );

      try {
        const layer = getLayerFromRequest(request);
        const cyclopsClient = await getCyclopsClient(layer);

        // 1. Создаём сделку
        const createResult = await cyclopsClient.call<{ deal_id: string }>('create_deal', dealParams);

        if (createResult.error) {
          updatePayoutStatus(
            payout.id, 'failed', undefined, JSON.stringify(createResult.error),
            `Cyclops create_deal: ${createResult.error.message}`
          );
          return NextResponse.json({
            error: 'Ошибка создания сделки в Cyclops',
            details: createResult.error,
            payout_id: payout.id,
          }, { status: 400 });
        }

        const dealId = (createResult.result as { deal_id: string }).deal_id;

        // 2. Исполняем сделку
        const executeResult = await cyclopsClient.call('execute_deal', { deal_id: dealId });

        if (executeResult.error) {
          // Сделка создана, но не исполнена — сохраняем deal_id, статус failed
          updatePayoutStatus(
            payout.id, 'failed', dealId, JSON.stringify(executeResult.error),
            `Cyclops execute_deal: ${executeResult.error.message}`
          );
          return NextResponse.json({
            error: 'Сделка создана, но ошибка при исполнении',
            deal_id: dealId,
            details: executeResult.error,
            payout_id: payout.id,
          }, { status: 400 });
        }

        // Успех
        updatePayoutStatus(
          payout.id, 'completed', dealId,
          JSON.stringify({ create: createResult.result, execute: executeResult.result })
        );

        return NextResponse.json({
          success: true,
          payout_id: payout.id,
          cyclops_deal_id: dealId,
          amount: calculation.payout_amount,
          client_name: client.name,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка Cyclops';
        updatePayoutStatus(payout.id, 'failed', undefined, undefined, errorMessage);

        return NextResponse.json({
          error: 'Ошибка при выплате через Cyclops',
          payout_id: payout.id,
          details: errorMessage,
        }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: 'Неизвестный action. Допустимые: calculate, execute' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Client Payout API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
