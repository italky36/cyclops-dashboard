import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'cyclops_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionPayload {
  sub: string;
  username: string;
  exp: number;
  iat: number;
}

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: { id: number; username: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.id))
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(getAuthSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (!payload.sub || typeof payload.username !== 'string') {
      return null;
    }
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  };
}
