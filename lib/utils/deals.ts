import type { DealStatus, RecipientType } from '@/types/cyclops/deals';

// Человекочитаемые названия статусов
export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  new: 'Новая',
  in_process: 'В процессе',
  partial: 'Частично исполнена',
  closed: 'Завершена',
  rejected: 'Отменена',
  correction: 'Требует коррекции',
  canceled_by_platform: 'Отменена площадкой',
};

// Цвета для статусов (Tailwind classes)
export const DEAL_STATUS_COLORS: Record<DealStatus, string> = {
  new: 'bg-gray-100 text-gray-800',
  in_process: 'bg-blue-100 text-blue-800',
  partial: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  correction: 'bg-orange-100 text-orange-800',
  canceled_by_platform: 'bg-red-100 text-red-800',
};

// Названия типов получателей
export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  payment_contract: 'Оплата по договору',
  commission: 'Комиссия',
  ndfl: 'НДФЛ (бюджетный платёж)',
  ndfl_to_virtual_account: 'Сбор на налоги (ВС)',
  payment_contract_by_sbp: 'СБП',
  payment_contract_by_sbp_v2: 'СБП (v2)',
  payment_contract_to_card: 'На карту',
};

// Доступные действия по статусу
export function getAvailableActions(status: DealStatus): {
  canExecute: boolean;
  canEdit: boolean;
  canReject: boolean;
  canCancelFromCorrection: boolean;
} {
  switch (status) {
    case 'new':
      return { canExecute: true, canEdit: true, canReject: true, canCancelFromCorrection: false };
    case 'partial':
      return { canExecute: true, canEdit: true, canReject: false, canCancelFromCorrection: false };
    case 'correction':
      return { canExecute: false, canEdit: true, canReject: false, canCancelFromCorrection: true };
    case 'in_process':
    case 'closed':
    case 'rejected':
    case 'canceled_by_platform':
    default:
      return { canExecute: false, canEdit: false, canReject: false, canCancelFromCorrection: false };
  }
}

// Форматирование суммы
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(amount);
}

// Форматирование даты
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

// Валидация суммы сделки
export function validateDealAmounts(
  totalAmount: number,
  payers: Array<{ amount: number }>,
  recipients: Array<{ amount: number }>
): { valid: boolean; error?: string } {
  const payersTotal = payers.reduce((sum, p) => sum + p.amount, 0);
  const recipientsTotal = recipients.reduce((sum, r) => sum + r.amount, 0);

  // Округляем до 2 знаков для сравнения
  const round = (n: number) => Math.round(n * 100) / 100;

  if (round(payersTotal) !== round(totalAmount)) {
    return { valid: false, error: `Сумма плательщиков (${payersTotal}) не равна общей сумме (${totalAmount})` };
  }

  if (round(recipientsTotal) !== round(totalAmount)) {
    return { valid: false, error: `Сумма получателей (${recipientsTotal}) не равна общей сумме (${totalAmount})` };
  }

  return { valid: true };
}

// Генерация уникального номера получателя
export function generateRecipientNumber(existingNumbers: number[]): number {
  if (existingNumbers.length === 0) return 1;
  return Math.max(...existingNumbers) + 1;
}
