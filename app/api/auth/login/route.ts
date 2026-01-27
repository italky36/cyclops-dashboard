import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername } from '@/lib/users';
import { normalizeUsername, verifyPassword } from '@/lib/auth';
import { clearLoginAttempts, getLoginBlockStatus, recordLoginAttempt } from '@/lib/login-attempts';
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = normalizeUsername(String(body?.username || ''));
    const password = String(body?.password || '');

    if (!username || !password) {
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

    const user = findUserByUsername(username);
    if (!user) {
      recordLoginAttempt(username, false);
      return NextResponse.json({ error: 'Неверные учетные данные' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      recordLoginAttempt(username, false);
      return NextResponse.json({ error: 'Неверные учетные данные' }, { status: 401 });
    }

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
