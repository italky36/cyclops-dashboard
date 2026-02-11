import { NextRequest, NextResponse } from 'next/server';
import {
  getClientById,
  updateClient,
  deleteClient,
  getMachinesByClient,
} from '@/lib/clients';
import { getPayoutHistory } from '@/lib/vending';

// GET /api/clients/[clientId] — детали клиента
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseInt(clientId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    const machines = getMachinesByClient(id);
    const payouts = getPayoutHistory({ beneficiary_id: '' })
      .filter(p => (p as Record<string, unknown>).client_id === id);

    return NextResponse.json({ client, machines, payouts });
  } catch (error) {
    console.error('[Client API] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// PUT /api/clients/[clientId] — обновление клиента
export async function PUT(
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
    const client = updateClient(id, body, body.user_id);

    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    return NextResponse.json({ client });
  } catch (error) {
    console.error('[Client API] PUT Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/[clientId] — удаление клиента
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseInt(clientId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    deleteClient(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Client API] DELETE Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
