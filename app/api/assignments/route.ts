import { NextRequest, NextResponse } from 'next/server';
import {
  assignMachine,
  unassignMachine,
  getMachinesByBeneficiary,
  getAssignmentHistory,
  getAllActiveAssignments,
} from '@/lib/vending';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    // Получение автоматов для конкретного бенефициара
    if (action === 'by_beneficiary') {
      const beneficiary_id = searchParams.get('beneficiary_id');
      if (!beneficiary_id) {
        return NextResponse.json({ error: 'beneficiary_id required' }, { status: 400 });
      }
      const machines = getMachinesByBeneficiary(beneficiary_id);
      return NextResponse.json({ machines });
    }

    // История привязок для автомата
    if (action === 'history') {
      const machine_id = searchParams.get('machine_id');
      if (!machine_id) {
        return NextResponse.json({ error: 'machine_id required' }, { status: 400 });
      }
      const history = getAssignmentHistory(parseInt(machine_id, 10));
      return NextResponse.json({ history });
    }

    // Все активные привязки
    if (action === 'all_active') {
      const assignments = getAllActiveAssignments();
      return NextResponse.json({ assignments });
    }

    return NextResponse.json({
      actions: ['by_beneficiary', 'history', 'all_active'],
    });
  } catch (error) {
    console.error('[Assignments API] Error:', error);
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

    // Привязка автомата к бенефициару
    if (action === 'assign') {
      const { machine_id, beneficiary_id, commission_percent = 10.0, created_by } = body;

      if (!machine_id || !beneficiary_id) {
        return NextResponse.json(
          { error: 'machine_id and beneficiary_id required' },
          { status: 400 }
        );
      }

      if (commission_percent < 0 || commission_percent > 100) {
        return NextResponse.json(
          { error: 'commission_percent must be between 0 and 100' },
          { status: 400 }
        );
      }

      const assignment = assignMachine({
        machine_id: parseInt(machine_id, 10),
        beneficiary_id,
        commission_percent,
        created_by,
      });

      return NextResponse.json({
        success: true,
        assignment,
      });
    }

    // Отвязка автомата от бенефициара
    if (action === 'unassign') {
      const { assignment_id, user_id } = body;

      if (!assignment_id) {
        return NextResponse.json(
          { error: 'assignment_id required' },
          { status: 400 }
        );
      }

      unassignMachine(parseInt(assignment_id, 10), user_id);

      return NextResponse.json({
        success: true,
      });
    }

    return NextResponse.json(
      { error: 'Unknown action. Available: assign, unassign' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Assignments API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
