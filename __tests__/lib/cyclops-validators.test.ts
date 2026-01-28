/**
 * Тесты для валидаторов Cyclops API
 */

import {
  accountNumberSchema,
  bankCodeSchema,
  dateSchema,
  amountSchema,
  uuidSchema,
  paymentFiltersSchema,
  listPaymentsV2Schema,
  identifyPaymentSchema,
  paymentOwnerSchema,
  datetimeWithTzSchema,
  paymentStatusEnum,
  paymentTypeEnum,
  validateIdentifyAmounts,
  canIdentifyPaymentType,
  validateParams,
  formatAmount,
  isInnOptionalForAccount,
} from '@/lib/cyclops-validators';

describe('accountNumberSchema', () => {
  test('validates 20 digit account number', () => {
    const result = accountNumberSchema.safeParse('40702810123456789012');
    expect(result.success).toBe(true);
  });

  test('rejects account with less than 20 digits', () => {
    const result = accountNumberSchema.safeParse('4070281012345678');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('20 цифр');
  });

  test('rejects account with more than 20 digits', () => {
    const result = accountNumberSchema.safeParse('407028101234567890123');
    expect(result.success).toBe(false);
  });

  test('rejects account with non-digit characters', () => {
    const result = accountNumberSchema.safeParse('4070281012345678901A');
    expect(result.success).toBe(false);
  });

  test('rejects empty string', () => {
    const result = accountNumberSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('bankCodeSchema', () => {
  test('validates 9 digit BIC', () => {
    const result = bankCodeSchema.safeParse('044525225');
    expect(result.success).toBe(true);
  });

  test('rejects BIC with less than 9 digits', () => {
    const result = bankCodeSchema.safeParse('04452522');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('9 цифр');
  });

  test('rejects BIC with more than 9 digits', () => {
    const result = bankCodeSchema.safeParse('0445252251');
    expect(result.success).toBe(false);
  });

  test('rejects BIC with letters', () => {
    const result = bankCodeSchema.safeParse('04452522A');
    expect(result.success).toBe(false);
  });
});

describe('dateSchema', () => {
  test('validates YYYY-MM-DD format', () => {
    const result = dateSchema.safeParse('2024-01-15');
    expect(result.success).toBe(true);
  });

  test('rejects DD-MM-YYYY format', () => {
    const result = dateSchema.safeParse('15-01-2024');
    expect(result.success).toBe(false);
  });

  test('rejects invalid date', () => {
    const result = dateSchema.safeParse('2024-13-45');
    expect(result.success).toBe(false);
  });

  test('rejects date without dashes', () => {
    const result = dateSchema.safeParse('20240115');
    expect(result.success).toBe(false);
  });
});

describe('datetimeWithTzSchema', () => {
  test('validates datetime with positive timezone', () => {
    const result = datetimeWithTzSchema.safeParse('2024-01-15 14:30:00+03');
    expect(result.success).toBe(true);
  });

  test('validates datetime with negative timezone', () => {
    const result = datetimeWithTzSchema.safeParse('2024-01-15 14:30:00-05');
    expect(result.success).toBe(true);
  });

  test('validates datetime with UTC timezone', () => {
    const result = datetimeWithTzSchema.safeParse('2024-01-15 14:30:00+00');
    expect(result.success).toBe(true);
  });

  test('rejects datetime without timezone', () => {
    const result = datetimeWithTzSchema.safeParse('2024-01-15 14:30:00');
    expect(result.success).toBe(false);
  });

  test('rejects ISO format with T separator', () => {
    const result = datetimeWithTzSchema.safeParse('2024-01-15T14:30:00+03');
    expect(result.success).toBe(false);
  });
});

describe('amountSchema', () => {
  test('validates positive number with 2 decimals', () => {
    const result = amountSchema.safeParse(100.50);
    expect(result.success).toBe(true);
  });

  test('validates positive integer', () => {
    const result = amountSchema.safeParse(100);
    expect(result.success).toBe(true);
  });

  test('validates positive number with 1 decimal', () => {
    const result = amountSchema.safeParse(100.5);
    expect(result.success).toBe(true);
  });

  test('rejects negative number', () => {
    const result = amountSchema.safeParse(-100);
    expect(result.success).toBe(false);
  });

  test('rejects zero', () => {
    const result = amountSchema.safeParse(0);
    expect(result.success).toBe(false);
  });

  test('rejects number with more than 2 decimals', () => {
    const result = amountSchema.safeParse(100.123);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('2 знака');
  });
});

describe('uuidSchema', () => {
  test('validates valid UUID', () => {
    const result = uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000');
    expect(result.success).toBe(true);
  });

  test('rejects invalid UUID', () => {
    const result = uuidSchema.safeParse('not-a-uuid');
    expect(result.success).toBe(false);
  });

  test('rejects empty string', () => {
    const result = uuidSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('paymentStatusEnum', () => {
  test('validates all payment statuses', () => {
    const statuses = ['new', 'in_process', 'executed', 'rejected', 'returned'];
    statuses.forEach((status) => {
      const result = paymentStatusEnum.safeParse(status);
      expect(result.success).toBe(true);
    });
  });

  test('rejects invalid status', () => {
    const result = paymentStatusEnum.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});

describe('paymentTypeEnum', () => {
  test('validates all payment types', () => {
    const types = [
      'incoming',
      'incoming_sbp',
      'incoming_unrecognized',
      'incoming_by_sbp_v2',
      'unrecognized_refund',
      'unrecognized_refund_sbp',
      'payment_contract',
      'payment_contract_by_sbp_v2',
      'payment_contract_to_card',
      'commission',
      'ndfl',
      'refund',
      'card',
    ];
    types.forEach((type) => {
      const result = paymentTypeEnum.safeParse(type);
      expect(result.success).toBe(true);
    });
  });

  test('rejects invalid type', () => {
    const result = paymentTypeEnum.safeParse('unknown_type');
    expect(result.success).toBe(false);
  });
});

describe('paymentFiltersSchema', () => {
  test('validates empty filters', () => {
    const result = paymentFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('validates account filter with 20 digits', () => {
    const result = paymentFiltersSchema.safeParse({
      account: '40702810123456789012',
    });
    expect(result.success).toBe(true);
  });

  test('rejects account filter with invalid length', () => {
    const result = paymentFiltersSchema.safeParse({
      account: '12345',
    });
    expect(result.success).toBe(false);
  });

  test('validates bic filter with 9 digits', () => {
    const result = paymentFiltersSchema.safeParse({
      bic: '044525225',
    });
    expect(result.success).toBe(true);
  });

  test('rejects bic filter with invalid length', () => {
    const result = paymentFiltersSchema.safeParse({
      bic: '12345',
    });
    expect(result.success).toBe(false);
  });

  test('validates single status filter', () => {
    const result = paymentFiltersSchema.safeParse({
      status: 'new',
    });
    expect(result.success).toBe(true);
  });

  test('validates array of statuses', () => {
    const result = paymentFiltersSchema.safeParse({
      status: ['new', 'executed'],
    });
    expect(result.success).toBe(true);
  });

  test('validates single type filter', () => {
    const result = paymentFiltersSchema.safeParse({
      type: 'incoming',
    });
    expect(result.success).toBe(true);
  });

  test('validates array of types', () => {
    const result = paymentFiltersSchema.safeParse({
      type: ['incoming', 'incoming_sbp'],
    });
    expect(result.success).toBe(true);
  });

  test('validates boolean filters', () => {
    const result = paymentFiltersSchema.safeParse({
      incoming: true,
      identify: false,
    });
    expect(result.success).toBe(true);
  });

  test('validates date filters', () => {
    const result = paymentFiltersSchema.safeParse({
      create_date: '2024-01-15',
      update_date: '2024-01-16',
    });
    expect(result.success).toBe(true);
  });

  test('validates datetime with timezone filters', () => {
    const result = paymentFiltersSchema.safeParse({
      updated_at_from: '2024-01-15 00:00:00+03',
      updated_at_to: '2024-01-16 23:59:59+03',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid date format in create_date', () => {
    const result = paymentFiltersSchema.safeParse({
      create_date: '15-01-2024',
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid datetime format', () => {
    const result = paymentFiltersSchema.safeParse({
      updated_at_from: '2024-01-15T00:00:00+03',
    });
    expect(result.success).toBe(false);
  });

  test('validates c2b_qr_code_id UUID filter', () => {
    const result = paymentFiltersSchema.safeParse({
      c2b_qr_code_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  test('rejects unknown fields (strict mode)', () => {
    const result = paymentFiltersSchema.safeParse({
      unknown_field: 'value',
    });
    expect(result.success).toBe(false);
  });
});

describe('listPaymentsV2Schema', () => {
  test('validates with default values', () => {
    const result = listPaymentsV2Schema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.per_page).toBe(100);
    }
  });

  test('validates custom page and per_page', () => {
    const result = listPaymentsV2Schema.safeParse({
      page: 5,
      per_page: 500,
    });
    expect(result.success).toBe(true);
  });

  test('validates with filters', () => {
    const result = listPaymentsV2Schema.safeParse({
      page: 1,
      per_page: 50,
      filters: {
        incoming: true,
        identify: false,
      },
    });
    expect(result.success).toBe(true);
  });

  test('rejects page less than 1', () => {
    const result = listPaymentsV2Schema.safeParse({
      page: 0,
    });
    expect(result.success).toBe(false);
  });

  test('rejects per_page greater than 1000', () => {
    const result = listPaymentsV2Schema.safeParse({
      per_page: 1001,
    });
    expect(result.success).toBe(false);
  });

  test('rejects negative per_page', () => {
    const result = listPaymentsV2Schema.safeParse({
      per_page: -10,
    });
    expect(result.success).toBe(false);
  });
});

describe('paymentOwnerSchema', () => {
  test('validates valid owner', () => {
    const result = paymentOwnerSchema.safeParse({
      virtual_account: '550e8400-e29b-41d4-a716-446655440000',
      amount: 1000.50,
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid UUID', () => {
    const result = paymentOwnerSchema.safeParse({
      virtual_account: 'invalid',
      amount: 1000,
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid amount', () => {
    const result = paymentOwnerSchema.safeParse({
      virtual_account: '550e8400-e29b-41d4-a716-446655440000',
      amount: -100,
    });
    expect(result.success).toBe(false);
  });

  test('rejects amount with more than 2 decimals', () => {
    const result = paymentOwnerSchema.safeParse({
      virtual_account: '550e8400-e29b-41d4-a716-446655440000',
      amount: 100.123,
    });
    expect(result.success).toBe(false);
  });
});

describe('identifyPaymentSchema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  test('validates with one owner', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      owners: [{ virtual_account: validUUID, amount: 1000 }],
    });
    expect(result.success).toBe(true);
  });

  test('validates with multiple owners', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      owners: [
        { virtual_account: validUUID, amount: 500 },
        { virtual_account: validUUID, amount: 500 },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('validates with is_returned_payment flag', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      is_returned_payment: true,
      owners: [{ virtual_account: validUUID, amount: 1000 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_returned_payment).toBe(true);
    }
  });

  test('defaults is_returned_payment to false', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      owners: [{ virtual_account: validUUID, amount: 1000 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_returned_payment).toBe(false);
    }
  });

  test('requires at least one owner', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      owners: [],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('минимум один owner');
  });

  test('rejects invalid payment_id', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: 'not-a-uuid',
      owners: [{ virtual_account: validUUID, amount: 1000 }],
    });
    expect(result.success).toBe(false);
  });

  test('rejects owner with invalid virtual_account', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      owners: [{ virtual_account: 'invalid', amount: 1000 }],
    });
    expect(result.success).toBe(false);
  });

  test('validates amount with 2 decimal places', () => {
    const result = identifyPaymentSchema.safeParse({
      payment_id: validUUID,
      owners: [{ virtual_account: validUUID, amount: 1000.55 }],
    });
    expect(result.success).toBe(true);
  });
});

describe('validateIdentifyAmounts', () => {
  test('returns valid for matching amounts', () => {
    const result = validateIdentifyAmounts(1000, [{ amount: 1000 }]);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('returns valid for multiple owners summing to payment amount', () => {
    const result = validateIdentifyAmounts(1000, [
      { amount: 400 },
      { amount: 600 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('returns valid for amounts with decimals', () => {
    const result = validateIdentifyAmounts(100.50, [
      { amount: 50.25 },
      { amount: 50.25 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('returns error for mismatch', () => {
    const result = validateIdentifyAmounts(1000, [{ amount: 900 }]);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('900.00');
    expect(result.error).toContain('1000.00');
  });

  test('handles floating point precision', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    const result = validateIdentifyAmounts(0.3, [
      { amount: 0.1 },
      { amount: 0.2 },
    ]);
    expect(result.valid).toBe(true);
  });

  test('handles small differences within tolerance', () => {
    const result = validateIdentifyAmounts(100.00, [{ amount: 100.005 }]);
    expect(result.valid).toBe(true);
  });

  test('returns error for difference greater than 0.01', () => {
    const result = validateIdentifyAmounts(100.00, [{ amount: 100.02 }]);
    expect(result.valid).toBe(false);
  });

  test('returns valid for empty owners array summing to zero payment', () => {
    // Edge case - shouldn't happen in practice but tests the logic
    const result = validateIdentifyAmounts(0, []);
    // Sum is 0, payment is 0, difference is 0
    expect(result.valid).toBe(true);
  });
});

describe('canIdentifyPaymentType', () => {
  test('returns true for incoming payments', () => {
    expect(canIdentifyPaymentType('incoming')).toBe(true);
  });

  test('returns true for incoming_sbp payments', () => {
    expect(canIdentifyPaymentType('incoming_sbp')).toBe(true);
  });

  test('returns true for incoming_by_sbp_v2 payments', () => {
    expect(canIdentifyPaymentType('incoming_by_sbp_v2')).toBe(true);
  });

  test('returns false for incoming_unrecognized', () => {
    expect(canIdentifyPaymentType('incoming_unrecognized')).toBe(false);
  });

  test('returns false for unrecognized_refund', () => {
    expect(canIdentifyPaymentType('unrecognized_refund')).toBe(false);
  });

  test('returns false for unrecognized_refund_sbp', () => {
    expect(canIdentifyPaymentType('unrecognized_refund_sbp')).toBe(false);
  });

  test('returns true for payment_contract (outgoing)', () => {
    expect(canIdentifyPaymentType('payment_contract')).toBe(true);
  });
});

describe('validateParams', () => {
  test('returns success with parsed data', () => {
    const result = validateParams(accountNumberSchema, '40702810123456789012');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('40702810123456789012');
    }
  });

  test('returns errors array on failure', () => {
    const result = validateParams(accountNumberSchema, '123');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toBeInstanceOf(Array);
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test('includes field path in error message', () => {
    const result = validateParams(identifyPaymentSchema, {
      payment_id: 'invalid',
      owners: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('payment_id'))).toBe(true);
    }
  });
});

describe('formatAmount', () => {
  test('rounds to 2 decimal places', () => {
    expect(formatAmount(100.456)).toBe(100.46);
  });

  test('handles integer input', () => {
    expect(formatAmount(100)).toBe(100);
  });

  test('handles single decimal', () => {
    expect(formatAmount(100.5)).toBe(100.5);
  });

  test('rounds down correctly', () => {
    expect(formatAmount(100.444)).toBe(100.44);
  });

  test('rounds up correctly', () => {
    expect(formatAmount(100.445)).toBe(100.45);
  });
});

describe('isInnOptionalForAccount', () => {
  test('returns true for personal account prefix 40817', () => {
    expect(isInnOptionalForAccount('40817810123456789012')).toBe(true);
  });

  test('returns true for deposit account prefix 423', () => {
    expect(isInnOptionalForAccount('42301810123456789012')).toBe(true);
  });

  test('returns true for account prefix 40820', () => {
    expect(isInnOptionalForAccount('40820810123456789012')).toBe(true);
  });

  test('returns true for account prefix 40803', () => {
    expect(isInnOptionalForAccount('40803810123456789012')).toBe(true);
  });

  test('returns true for account prefix 40813', () => {
    expect(isInnOptionalForAccount('40813810123456789012')).toBe(true);
  });

  test('returns true for account prefix 426', () => {
    expect(isInnOptionalForAccount('42601810123456789012')).toBe(true);
  });

  test('returns false for business account prefix 40702', () => {
    expect(isInnOptionalForAccount('40702810123456789012')).toBe(false);
  });

  test('returns false for non-matching prefix', () => {
    expect(isInnOptionalForAccount('30101810123456789012')).toBe(false);
  });
});
