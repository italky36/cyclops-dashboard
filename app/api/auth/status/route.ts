import { NextResponse } from 'next/server';
import { countUsers } from '@/lib/users';

export async function GET() {
  const hasUsers = countUsers() > 0;
  return NextResponse.json({ hasUsers });
}
