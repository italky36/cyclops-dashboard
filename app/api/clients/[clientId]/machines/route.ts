import { NextRequest, NextResponse } from 'next/server';
import {
  getClientById,
  getMachinesByClient,
  assignMachineToClient,
  unassignMachineFromClient,
} from '@/lib/clients';
import { getUnassignedMachines } from '@/lib/vending';

// GET /api/clients/[clientId]/machines — машины клиента + свободные
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

    const assigned = getMachinesByClient(id);
    const unassigned = getUnassignedMachines();

    return NextResponse.json({ assigned, unassigned });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/clients/[clientId]/machines — привязать машину
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
    const { machine_id, commission_percent } = body;

    if (!machine_id || commission_percent === undefined) {
      return NextResponse.json(
        { error: 'Обязательные поля: machine_id, commission_percent' },
        { status: 400 }
      );
    }

    assignMachineToClient({
      machine_id: parseInt(machine_id, 10),
      client_id: id,
      commission_percent: parseFloat(commission_percent),
      created_by: body.user_id,
    });

    const assigned = getMachinesByClient(id);
    return NextResponse.json({ success: true, assigned });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/[clientId]/machines — отвязать машину
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

    const { searchParams } = new URL(request.url);
    const assignment_id = searchParams.get('assignment_id');

    if (!assignment_id) {
      return NextResponse.json({ error: 'assignment_id обязателен' }, { status: 400 });
    }

    unassignMachineFromClient(parseInt(assignment_id, 10));
    const assigned = getMachinesByClient(id);
    return NextResponse.json({ success: true, assigned });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
