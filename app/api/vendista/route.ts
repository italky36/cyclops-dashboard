import { NextRequest, NextResponse } from 'next/server';
import { createVendistaClient, isVendistaConfigured } from '@/lib/vendista';
import {
  syncMachines,
  getAllMachines,
  getUnassignedMachines,
  getMachineById,
} from '@/lib/vending';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  // Проверка статуса конфигурации
  if (action === 'status') {
    return NextResponse.json({
      configured: isVendistaConfigured(),
      base_url: process.env.VENDISTA_BASE_URL || 'https://api.vendista.ru:99',
    });
  }

  // Получение локальных данных из БД (не требует Vendista API)
  if (action === 'machines') {
    const machines = getAllMachines();
    return NextResponse.json({ machines });
  }

  if (action === 'unassigned') {
    const machines = getUnassignedMachines();
    return NextResponse.json({ machines });
  }

  if (action === 'machine') {
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Machine ID required' }, { status: 400 });
    }
    const machine = getMachineById(parseInt(id, 10));
    if (!machine) {
      return NextResponse.json({ error: 'Machine not found' }, { status: 404 });
    }
    return NextResponse.json({ machine });
  }

  return NextResponse.json({
    actions: ['status', 'machines', 'unassigned', 'machine'],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!isVendistaConfigured()) {
      return NextResponse.json(
        { error: 'Vendista API not configured. Set VENDISTA_API_KEY in environment.' },
        { status: 400 }
      );
    }

    const client = createVendistaClient();

    // Синхронизация автоматов
    if (action === 'sync_machines') {
      const vendistaMachines = await client.fetchMachines();
      const count = syncMachines(vendistaMachines);
      const machines = getAllMachines();

      return NextResponse.json({
        success: true,
        synced_count: count,
        machines,
      });
    }

    // Получение транзакций из Vendista
    if (action === 'fetch_transactions') {
      const { term_id, startDate, endDate } = body;

      if (!term_id) {
        return NextResponse.json(
          { error: 'term_id is required (terminal_id from machine)' },
          { status: 400 }
        );
      }

      const transactions = await client.fetchTransactions({
        term_id,
        startDate,
        endDate,
      });

      return NextResponse.json({
        success: true,
        transactions,
        count: transactions.length,
      });
    }

    // Тест соединения
    if (action === 'test_connection') {
      const success = await client.testConnection();
      return NextResponse.json({ success });
    }

    return NextResponse.json(
      { error: 'Unknown action. Available: sync_machines, fetch_transactions, test_connection' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Vendista API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
