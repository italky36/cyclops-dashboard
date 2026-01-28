export const STATUS_CHECK_COOLDOWN_MS = 5 * 60 * 1000;

export function getStatusCheckWindow(
  lastCheckedAt: number | null,
  now: number = Date.now()
): { allowed: boolean; remainingMs: number; nextAvailableAt: number } {
  if (!lastCheckedAt) {
    return { allowed: true, remainingMs: 0, nextAvailableAt: now };
  }

  const elapsed = now - lastCheckedAt;
  if (elapsed >= STATUS_CHECK_COOLDOWN_MS) {
    return { allowed: true, remainingMs: 0, nextAvailableAt: now };
  }

  const remainingMs = STATUS_CHECK_COOLDOWN_MS - elapsed;
  return {
    allowed: false,
    remainingMs,
    nextAvailableAt: lastCheckedAt + STATUS_CHECK_COOLDOWN_MS,
  };
}
