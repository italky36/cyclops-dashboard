import { NextRequest, NextResponse } from 'next/server';
import {
  getClientById,
  getMachinesByClient,
  assignMachineToClient,
  unassignMachineFromClient,
} from '@/lib/clients';
import { getUnassignedMachines } from '@/lib/vending';
import { parseClientIdParam } from '@/lib/client-slug';

// GET /api/clients/[clientId]/machines — машины клиента + свободные
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseClientIdParam(clientId);
    if (!id) {
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
    const id = parseClientIdParam(clientId);
    if (!id) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    const body = await request.json();
    const rawIds = Array.isArray(body.machine_ids)
      ? body.machine_ids
      : body.machine_id !== undefined && body.machine_id !== null
        ? [body.machine_id]
        : [];

    const machineIds = rawIds
      .map((value: unknown) => parseInt(String(value), 10))
      .filter((value: number) => !Number.isNaN(value));

    if (machineIds.length === 0) {
      return NextResponse.json(
        { error: 'Передайте machine_id или machine_ids' },
        { status: 400 }
      );
    }

    const commissionBase = typeof body.commission_percent === 'number'
      ? body.commission_percent
      : client.commission_percent ?? 0;

    const assignedAt = typeof body.assigned_at === 'string' && body.assigned_at
      ? new Date(body.assigned_at).toISOString()
      : undefined;

    for (const machine_id of machineIds) {
      assignMachineToClient({
        machine_id,
        client_id: id,
        commission_percent: commissionBase,
        created_by: body.user_id,
        assigned_at: assignedAt,
      });
    }

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
    const id = parseClientIdParam(clientId);
    if (!id) {
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
