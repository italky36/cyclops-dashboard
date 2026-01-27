import { NextRequest, NextResponse } from 'next/server';
import {
  countUsers,
  createUser,
  deleteUserById,
  findUserByUsername,
  listUsers,
  updateUserPassword,
} from '@/lib/users';
import { hashPassword, normalizeUsername } from '@/lib/auth';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

function parseUserId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const session = await verifySessionToken(token);
  if (!session?.sub) {
    return null;
  }
  return parseUserId(session.sub);
}

export async function GET() {
  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body?.action || '');

    if (action === 'create') {
      const username = normalizeUsername(String(body?.username || ''));
      const password = String(body?.password || '');

      if (!username || !password) {
        return NextResponse.json({ error: 'Укажите логин и пароль' }, { status: 400 });
      }

      if (password.length < 8) {
        return NextResponse.json({ error: 'Пароль должен быть не короче 8 символов' }, { status: 400 });
      }

      if (findUserByUsername(username)) {
        return NextResponse.json({ error: 'Пользователь уже существует' }, { status: 409 });
      }

      const passwordHash = await hashPassword(password);
      const user = createUser(username, passwordHash);

      return NextResponse.json({
        success: true,
        user: { id: user.id, username: user.username, created_at: user.created_at },
      });
    }

    if (action === 'update-password') {
      const userId = parseUserId(body?.userId);
      const password = String(body?.password || '');

      if (!userId || !password) {
        return NextResponse.json({ error: 'Укажите пользователя и пароль' }, { status: 400 });
      }

      if (password.length < 8) {
        return NextResponse.json({ error: 'Пароль должен быть не короче 8 символов' }, { status: 400 });
      }

      const passwordHash = await hashPassword(password);
      const updated = updateUserPassword(userId, passwordHash);
      if (!updated) {
        return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const userId = parseUserId(body?.userId);
      if (!userId) {
        return NextResponse.json({ error: 'Укажите пользователя' }, { status: 400 });
      }

      const currentUserId = await getCurrentUserId(request);
      if (currentUserId && currentUserId === userId) {
        return NextResponse.json({ error: 'Нельзя удалить текущего пользователя' }, { status: 400 });
      }

      if (countUsers() <= 1) {
        return NextResponse.json({ error: 'Нельзя удалить последнего пользователя' }, { status: 400 });
      }

      const deleted = deleteUserById(userId);
      if (!deleted) {
        return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
