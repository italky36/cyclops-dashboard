const STORAGE_KEY = 'cyclops_beneficiary_status_checks';

type StatusChecksMap = Record<string, number>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readStatusChecks(): StatusChecksMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StatusChecksMap;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeStatusChecks(map: StatusChecksMap): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // noop: storage might be full or unavailable
  }
}

export function getLastStatusCheck(beneficiaryId: string): number | null {
  const map = readStatusChecks();
  const value = map[beneficiaryId];
  return typeof value === 'number' ? value : null;
}

export function setLastStatusCheck(beneficiaryId: string, checkedAt: number = Date.now()): void {
  const map = readStatusChecks();
  map[beneficiaryId] = checkedAt;
  writeStatusChecks(map);
}
