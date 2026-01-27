import { getDb } from '@/lib/db';

export interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface UserSummary {
  id: number;
  username: string;
  created_at: string;
}

export function countUsers(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return row.count;
}

export function listUsers(): UserSummary[] {
  const db = getDb();
  return db.prepare('SELECT id, username, created_at FROM users ORDER BY id ASC').all() as UserSummary[];
}

export function findUserByUsername(username: string): DbUser | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
  return row || null;
}

export function createUser(username: string, passwordHash: string): DbUser {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'
  ).run(username, passwordHash, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    username,
    password_hash: passwordHash,
    created_at: createdAt,
  };
}

export function updateUserPassword(userId: number, passwordHash: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  return result.changes > 0;
}

export function deleteUserById(userId: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}
