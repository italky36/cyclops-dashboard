import { getDb } from '@/lib/db';

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const CLEANUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface LoginBlockStatus {
  blocked: boolean;
  retryAfterMs?: number;
  remainingAttempts?: number;
}

export function getLoginBlockStatus(username: string): LoginBlockStatus {
  const db = getDb();
  const now = Date.now();
  const windowStart = now - ATTEMPT_WINDOW_MS;

  const row = db
    .prepare(
      'SELECT COUNT(*) as count FROM login_attempts WHERE username = ? AND success = 0 AND attempted_at >= ?'
    )
    .get(username, windowStart) as { count: number };

  if (row.count >= MAX_FAILED_ATTEMPTS) {
    const lastFailure = db
      .prepare(
        'SELECT attempted_at FROM login_attempts WHERE username = ? AND success = 0 ORDER BY attempted_at DESC LIMIT 1'
      )
      .get(username) as { attempted_at: number } | undefined;

    if (lastFailure) {
      const retryAfterMs = lastFailure.attempted_at + BLOCK_DURATION_MS - now;
      if (retryAfterMs > 0) {
        return { blocked: true, retryAfterMs };
      }
    }
  }

  return {
    blocked: false,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - row.count),
  };
}

export function recordLoginAttempt(username: string, success: boolean) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    'INSERT INTO login_attempts (username, success, attempted_at) VALUES (?, ?, ?)'
  ).run(username, success ? 1 : 0, now);

  const cleanupBefore = now - CLEANUP_WINDOW_MS;
  db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(cleanupBefore);
}

export function clearLoginAttempts(username: string) {
  const db = getDb();
  db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
}
