import { NextRequest, NextResponse } from 'next/server';
import { createVendistaClient, isVendistaConfigured } from '@/lib/vendista';
import {
  calculatePayout,
  createPayout,
  updatePayoutStatus,
  getPayoutById,
  getPayoutHistory,
  getPayoutDetails,
  getPayoutSchedule,
  updatePayoutSchedule,
  updateScheduleLastRun,
  getBeneficiariesWithMachines,
  getMachinesByBeneficiary,
  logAction,
} from '@/lib/vending';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    // Получение истории выплат
    if (action === 'history') {
      const beneficiary_id = searchParams.get('beneficiary_id') || undefined;
      const status = searchParams.get('status') || undefined;
      const date_from = searchParams.get('date_from') || undefined;
      const date_to = searchParams.get('date_to') || undefined;

      const payouts = getPayoutHistory({ beneficiary_id, status, date_from, date_to });
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

    // Получение бенефициаров с привязанными автоматами
    if (action === 'beneficiaries_with_machines') {
      const beneficiary_ids = getBeneficiariesWithMachines();
      return NextResponse.json({ beneficiary_ids });
    }

    return NextResponse.json({
      actions: ['history', 'details', 'schedule', 'beneficiaries_with_machines'],
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

    // Расчет суммы к выплате (preview)
    if (action === 'calculate') {
      const { beneficiary_id, end_date } = body;

      if (!beneficiary_id) {
        return NextResponse.json({ error: 'beneficiary_id required' }, { status: 400 });
      }

      // Получаем автоматы бенефициара
      const machines = getMachinesByBeneficiary(beneficiary_id);
      if (machines.length === 0) {
        return NextResponse.json({
          calculation: {
            beneficiary_id,
            period_start: end_date || new Date().toISOString().split('T')[0],
            period_end: end_date || new Date().toISOString().split('T')[0],
            machines: [],
            total_sales: 0,
            total_commission: 0,
            payout_amount: 0,
          },
          message: 'No machines assigned to this beneficiary',
        });
      }

      // Получаем транзакции из Vendista (если настроен)
      let transactions: { id: string | number; machine_id: string | number; date: string; amount: number }[] = [];

      if (isVendistaConfigured()) {
        const client = createVendistaClient();
        const vendista_ids = machines.map(m => m.vendista_id);

        // Определяем период для запроса - берем широкий диапазон
        const date_to = end_date || new Date().toISOString().split('T')[0];
        const date_from = machines.reduce((earliest, m) => {
          const assignedDate = m.assignment?.assigned_at.split('T')[0] || date_to;
          return assignedDate < earliest ? assignedDate : earliest;
        }, date_to);

        transactions = await client.fetchTransactionsForMachines({
          machine_ids: vendista_ids,
          date_from,
          date_to,
        });
      }

      const calculation = calculatePayout(beneficiary_id, transactions, end_date);

      return NextResponse.json({
        calculation,
        transactions_count: transactions.length,
      });
    }

    // Создание и выполнение выплаты
    if (action === 'execute') {
      const { beneficiary_id, end_date, virtual_account, user_id } = body;

      if (!beneficiary_id) {
        return NextResponse.json({ error: 'beneficiary_id required' }, { status: 400 });
      }

      // Получаем автоматы и транзакции
      const machines = getMachinesByBeneficiary(beneficiary_id);
      if (machines.length === 0) {
        return NextResponse.json({ error: 'No machines assigned to this beneficiary' }, { status: 400 });
      }

      let transactions: { id: string | number; machine_id: string | number; date: string; amount: number }[] = [];

      if (isVendistaConfigured()) {
        const client = createVendistaClient();
        const vendista_ids = machines.map(m => m.vendista_id);

        const date_to = end_date || new Date().toISOString().split('T')[0];
        const date_from = machines.reduce((earliest, m) => {
          const assignedDate = m.assignment?.assigned_at.split('T')[0] || date_to;
          return assignedDate < earliest ? assignedDate : earliest;
        }, date_to);

        transactions = await client.fetchTransactionsForMachines({
          machine_ids: vendista_ids,
          date_from,
          date_to,
        });
      }

      const calculation = calculatePayout(beneficiary_id, transactions, end_date);

      if (calculation.payout_amount <= 0) {
        return NextResponse.json({
          error: 'No payout amount to execute',
          calculation,
        }, { status: 400 });
      }

      // Создаем запись о выплате
      const payout = createPayout(calculation, user_id);

      // Пытаемся отправить в Cyclops (если передан virtual_account)
      if (virtual_account) {
        updatePayoutStatus(payout.id, 'processing');

        try {
          // Здесь будет интеграция с Cyclops API для создания deal/перевода
          // Пока имитируем успешный ответ
          const cyclops_response = {
            deal_id: `simulated_deal_${payout.id}_${Date.now()}`,
            status: 'executed',
          };

          updatePayoutStatus(
            payout.id,
            'completed',
            cyclops_response.deal_id,
            JSON.stringify(cyclops_response)
          );

          logAction('execute_payout', 'beneficiary_payout', String(payout.id), JSON.stringify({
            user_id,
            virtual_account,
            amount: calculation.payout_amount,
            cyclops_deal_id: cyclops_response.deal_id,
          }));

          return NextResponse.json({
            success: true,
            payout: getPayoutById(payout.id),
            cyclops_deal_id: cyclops_response.deal_id,
          });
        } catch (error) {
          const error_message = error instanceof Error ? error.message : 'Unknown Cyclops error';
          updatePayoutStatus(payout.id, 'failed', undefined, undefined, error_message);

          logAction('payout_failed', 'beneficiary_payout', String(payout.id), JSON.stringify({
            user_id,
            error: error_message,
          }));

          return NextResponse.json({
            error: 'Failed to execute payout via Cyclops',
            payout: getPayoutById(payout.id),
            details: error_message,
          }, { status: 500 });
        }
      }

      // Если virtual_account не передан - просто создаем запись pending
      return NextResponse.json({
        success: true,
        payout,
        message: 'Payout created but not executed (no virtual_account provided)',
      });
    }

    // Выполнение автоматических выплат для всех бенефициаров
    if (action === 'execute_scheduled') {
      const { user_id } = body;

      const beneficiary_ids = getBeneficiariesWithMachines();
      const results: Array<{ beneficiary_id: string; success: boolean; payout_id?: number; error?: string }> = [];

      for (const beneficiary_id of beneficiary_ids) {
        try {
          const machines = getMachinesByBeneficiary(beneficiary_id);
          let transactions: { id: string | number; machine_id: string | number; date: string; amount: number }[] = [];

          if (isVendistaConfigured()) {
            const client = createVendistaClient();
            const vendista_ids = machines.map(m => m.vendista_id);

            const date_to = new Date().toISOString().split('T')[0];
            const date_from = machines.reduce((earliest, m) => {
              const assignedDate = m.assignment?.assigned_at.split('T')[0] || date_to;
              return assignedDate < earliest ? assignedDate : earliest;
            }, date_to);

            transactions = await client.fetchTransactionsForMachines({
              machine_ids: vendista_ids,
              date_from,
              date_to,
            });
          }

          const calculation = calculatePayout(beneficiary_id, transactions);

          if (calculation.payout_amount > 0) {
            const payout = createPayout(calculation, user_id);
            // В автоматическом режиме выплата создается со статусом pending
            // для последующего подтверждения или автоматической отправки
            results.push({
              beneficiary_id,
              success: true,
              payout_id: payout.id,
            });
          } else {
            results.push({
              beneficiary_id,
              success: true,
              error: 'No payout amount',
            });
          }
        } catch (error) {
          results.push({
            beneficiary_id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      updateScheduleLastRun();

      logAction('scheduled_payouts', 'payout_schedule', null, JSON.stringify({
        user_id,
        total: beneficiary_ids.length,
        successful: results.filter(r => r.success && r.payout_id).length,
      }));

      return NextResponse.json({
        success: true,
        results,
        summary: {
          total: beneficiary_ids.length,
          created: results.filter(r => r.success && r.payout_id).length,
          skipped: results.filter(r => r.success && !r.payout_id).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    }

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
      { error: 'Unknown action. Available: calculate, execute, execute_scheduled, update_schedule' },
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
