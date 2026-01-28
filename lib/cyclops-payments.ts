import type { PaymentDetail } from '@/types/cyclops';

const KNOWN_PAYMENT_TYPES = new Set([
  'incoming',
  'incoming_sbp',
  'incoming_by_sbp_v2',
  'incoming_unrecognized',
  'unrecognized_refund',
  'unrecognized_refund_sbp',
  'payment_contract',
  'payment_contract_by_sbp',
  'payment_contract_by_sbp_v2',
  'payment_contract_to_card',
  'commission',
  'ndfl',
  'ndfl_from_virtual_account',
  'ndfl_to_executor',
  'ndfl_to_virtual_account',
  'refund_virtual_account',
  'refund',
  'card',
  'unhandled_spb_v2',
  'collection_order',
]);

const INCOMING_TYPES = new Set([
  'incoming',
  'incoming_sbp',
  'incoming_by_sbp_v2',
  'incoming_unrecognized',
]);

export function normalizePaymentRecord(raw: Record<string, unknown>): PaymentDetail | null {
  const unwrapped = (raw as { payment?: Record<string, unknown> }).payment || raw;

  const rawPaymentId =
    (typeof unwrapped.payment_id === 'string' || typeof unwrapped.payment_id === 'number')
      ? unwrapped.payment_id
      : (typeof unwrapped.id === 'string' || typeof unwrapped.id === 'number')
        ? unwrapped.id
        : (typeof unwrapped.paymentId === 'string' || typeof unwrapped.paymentId === 'number')
          ? unwrapped.paymentId
          : '';
  const paymentId = rawPaymentId ? String(rawPaymentId) : '';

  if (!paymentId) {
    return null;
  }

  const displayType = getDisplayPaymentType(unwrapped);

  const rawIncoming = unwrapped.incoming;
  const incoming =
    typeof rawIncoming === 'boolean'
      ? rawIncoming
      : typeof rawIncoming === 'number'
        ? rawIncoming !== 0
        : typeof rawIncoming === 'string'
          ? rawIncoming.toLowerCase() === 'true'
          : isIncomingPaymentType(displayType);

  const rawIdentify = unwrapped.identify ?? unwrapped.identified;
  const identify =
    typeof rawIdentify === 'boolean'
      ? rawIdentify
      : typeof rawIdentify === 'number'
        ? rawIdentify !== 0
        : typeof rawIdentify === 'string'
          ? rawIdentify.toLowerCase() === 'true'
          : false;

  return {
    ...(unwrapped as PaymentDetail),
    payment_id: paymentId,
    incoming,
    identify,
  };
}

export function isPaymentTypeKnown(value?: string): boolean {
  if (!value) return false;
  return KNOWN_PAYMENT_TYPES.has(value);
}

export function getDisplayPaymentType(payment: { type?: unknown; status?: unknown }): string | undefined {
  const typeValue = typeof payment.type === 'string' ? payment.type : undefined;
  if (typeValue) {
    return typeValue;
  }
  const statusValue = typeof payment.status === 'string' ? payment.status : undefined;
  if (statusValue && isPaymentTypeKnown(statusValue)) {
    return statusValue;
  }
  return undefined;
}

export function isIncomingPaymentType(type?: string): boolean {
  if (!type) return false;
  return INCOMING_TYPES.has(type);
}

export function getDisplayIdentifyFlag(
  payment: { identify?: unknown; identified?: unknown }
): boolean | undefined {
  if (typeof payment.identify === 'boolean') {
    return payment.identify;
  }
  if (typeof payment.identified === 'boolean') {
    return payment.identified;
  }
  return undefined;
}
