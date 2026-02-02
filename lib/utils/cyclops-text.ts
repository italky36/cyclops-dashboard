// Shared Cyclops text validation helpers (client + server).
// Matches the character set from the Cyclops API docs.

export const CYCLOPS_ALLOWED_TEXT_REGEX =
  /^[a-zA-Zа-яА-ЯёЁ0-9 ()!#$%&*+\-.,\/:;<=>?@\[\]\\^_`{|}~\n\r\t]*$/;

export const CYCLOPS_IDENTIFIER_REGEX =
  /^[a-zA-Zа-яА-ЯёЁ0-9!#$%&()*+\-.,\/:;<=>?@\[\]\\^_`{|}~\n\r\t]{1,60}$/;

export function isCyclopsAllowedText(value: string): boolean {
  return CYCLOPS_ALLOWED_TEXT_REGEX.test(value);
}

export function isCyclopsAllowedIdentifier(value: string): boolean {
  return CYCLOPS_IDENTIFIER_REGEX.test(value);
}

export function normalizeOptionalText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Удаляет из объекта пустые опциональные поля (undefined, null, пустые строки)
 * Используется перед отправкой данных в API для соответствия требованиям
 */
export function cleanOptionalFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Пропускаем undefined, null и пустые строки
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Пропускаем числовые значения, которые являются NaN
    if (typeof value === 'number' && isNaN(value)) {
      continue;
    }

    result[key] = value;
  }

  return result as Partial<T>;
}
