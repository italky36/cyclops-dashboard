import { NextRequest, NextResponse } from 'next/server';
import { countUsers, createUser } from '@/lib/users';
import { normalizeUsername, hashPassword } from '@/lib/auth';
import { clearLoginAttempts, getLoginBlockStatus, recordLoginAttempt } from '@/lib/login-attempts';
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    if (countUsers() > 0) {
      return NextResponse.json({ error: 'Настройка уже выполнена' }, { status: 403 });
    }

    const body = await request.json();
    const username = normalizeUsername(String(body?.username || ''));
    const password = String(body?.password || '');

    if (!username || !password) {
      if (username) {
        recordLoginAttempt(username, false);
      }
      return NextResponse.json({ error: 'Укажите логин и пароль' }, { status: 400 });
    }

    const blockStatus = getLoginBlockStatus(username);
    if (blockStatus.blocked) {
      const retryAfterSeconds = Math.ceil((blockStatus.retryAfterMs || 0) / 1000);
      const response = NextResponse.json(
        { error: 'Слишком много попыток. Попробуйте позже.', retryAfterSeconds },
        { status: 429 }
      );
      response.headers.set('Retry-After', String(retryAfterSeconds));
      return response;
    }

    if (password.length < 8) {
      recordLoginAttempt(username, false);
      return NextResponse.json({ error: 'Пароль должен быть не короче 8 символов' }, { status: 400 });
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(username, passwordHash);

    clearLoginAttempts(username);
    const token = await createSessionToken({ id: user.id, username: user.username });
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, token, getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
