import { NextRequest, NextResponse } from 'next/server';
import {
  getAssignmentHistory,
  getAllActiveAssignments,
} from '@/lib/vending';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
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
      actions: ['history', 'all_active'],
    });
  } catch (error) {
    console.error('[Assignments API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: 'Привязка автоматов к бенефициарам убрана. Используйте /api/clients/[clientId]/machines' },
    { status: 410 }
  );
}
