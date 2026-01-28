/**
 * Валидаторы для Cyclops API
 * Согласно документации: проверка форматов полей виртуальных счетов
 */

import { z } from 'zod';

// Счета, для которых ИНН опционален (физлица)
const INN_OPTIONAL_ACCOUNT_PREFIXES = ['40817', '423', '40820', '40803', '40813', '426'];

/**
 * Проверяет, начинается ли счёт с префикса, для которого ИНН опционален
 */
export function isInnOptionalForAccount(account: string): boolean {
  return INN_OPTIONAL_ACCOUNT_PREFIXES.some(prefix => account.startsWith(prefix));
}

/**
 * Сумма: float с максимум 2 знаками после запятой
 */
export const amountSchema = z.number()
  .positive('Сумма должна быть положительной')
  .refine(
    (val) => {
      const parts = val.toString().split('.');
      return !parts[1] || parts[1].length <= 2;
    },
    { message: 'Сумма может иметь максимум 2 знака после запятой' }
  );

/**
 * Номер счёта: ровно 20 цифр
 */
export const accountNumberSchema = z.string()
  .regex(/^\d{20}$/, 'Номер счёта должен содержать ровно 20 цифр');

/**
 * БИК банка: ровно 9 цифр
 */
export const bankCodeSchema = z.string()
  .regex(/^\d{9}$/, 'БИК банка должен содержать ровно 9 цифр');

/**
 * ИНН: 10 или 12 цифр
 */
export const innSchema = z.string()
  .regex(/^\d{10}$|^\d{12}$/, 'ИНН должен содержать 10 или 12 цифр');

/**
 * ИНН: ровно 12 цифр (ФЛ/ИП)
 */
export const inn12Schema = z.string()
  .regex(/^\d{12}$/, 'ИНН должен содержать ровно 12 цифр');

/**
 * ИНН опциональный (для физлиц)
 */
export const innOptionalSchema = z.string()
  .regex(/^\d{10}$|^\d{12}$/, 'ИНН должен содержать 10 или 12 цифр')
  .optional();

/**
 * КПП: ровно 9 цифр (если задан)
 */
export const kppSchema = z.string()
  .regex(/^\d{9}$/, 'КПП должен содержать ровно 9 цифр')
  .optional();

/**
 * Номер документа: до 6 символов
 */
export const documentNumberSchema = z.string()
  .max(6, 'Номер документа может содержать максимум 6 символов')
  .optional();

/**
 * Назначение платежа: до 210 символов
 */
export const purposeSchema = z.string()
  .max(210, 'Назначение платежа может содержать максимум 210 символов')
  .optional();

/**
 * Идентификатор: 1-60 символов
 * Допустимые символы: цифры, буквы (латиница и кириллица), пробелы, спецсимволы
 */
export const identifierSchema = z.string()
  .min(1, 'Идентификатор должен содержать минимум 1 символ')
  .max(60, 'Идентификатор может содержать максимум 60 символов')
  .optional();

/**
 * Дата в формате YYYY-MM-DD
 */
export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD')
  .refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Некорректная дата' }
  );

/**
 * UUID
 */
export const uuidSchema = z.string()
  .uuid('Некорректный формат UUID');

/**
 * Тип виртуального счёта
 */
export const virtualAccountTypeSchema = z.enum(['standard', 'for_ndfl'], {
  message: 'Тип счёта должен быть standard или for_ndfl'
});

/**
 * Тип операции для фильтрации транзакций
 */
export const operationTypeSchema = z.enum([
  'cash_add',
  'block_add',
  'block_add_from_cash',
  'cash_add_from_block',
  'block_write_off',
  'cash_write_off'
], {
  message: 'Некорректный тип операции'
});

/**
 * legal_type для фильтрации бенефициаров
 * F - физлицо, I - ИП, J - юрлицо
 */
export const legalTypeSchema = z.enum(['F', 'I', 'J'], {
  message: 'legal_type должен быть F, I или J'
});

// ==================== Схемы для API методов ====================

/**
 * Схема для create_virtual_account
 */
export const createVirtualAccountSchema = z.object({
  beneficiary_id: uuidSchema,
  virtual_account_type: virtualAccountTypeSchema.default('standard'),
});


/**
 * Схема для get_virtual_account
 */
export const getVirtualAccountSchema = z.object({
  virtual_account: uuidSchema,
});

/**
 * Схема для list_virtual_account
 */
export const listVirtualAccountsSchema = z.object({
  page: z.number().int().positive().default(1),
  per_page: z.number().int().min(100).max(1000).default(100),
  filters: z.object({
    beneficiary: z.object({
      id: uuidSchema.optional(),
      is_active: z.boolean().optional(),
      legal_type: legalTypeSchema.optional(),
      inn: innSchema.optional(),
    }).optional(),
  }).optional(),
});

/**
 * Схема для list_virtual_transaction
 */
export const listVirtualTransactionsSchema = z.object({
  page: z.number().int().positive().default(1),
  per_page: z.number().int().min(1).max(1000).default(100),
  filters: z.object({
    virtual_account: uuidSchema.optional(),
    deal_id: uuidSchema.optional(),
    payment_id: uuidSchema.optional(),
    created_date_from: dateSchema.optional(),
    created_date_to: dateSchema.optional(),
    incoming: z.boolean().optional(),
    operation_type: operationTypeSchema.optional(),
    include_block_operations: z.boolean().default(false),
  }),
});

/**
 * Схема для refund_virtual_account
 * Работает только со счетами типа standard
 */
export const refundVirtualAccountSchema = z.object({
  virtual_account: uuidSchema,
  recipient: z.object({
    amount: amountSchema,
    account: accountNumberSchema,
    bank_code: bankCodeSchema,
    name: z.string().min(1, 'Имя получателя обязательно'),
    inn: innSchema.optional(), // опционален для физлиц
    kpp: kppSchema,
    document_number: documentNumberSchema,
  }),
  purpose: purposeSchema,
  ext_key: uuidSchema.optional(), // для идемпотентности
  identifier: identifierSchema,
});

/**
 * Схема для transfer_between_virtual_accounts (v1)
 */
export const transferBetweenAccountsSchema = z.object({
  from_virtual_account: uuidSchema,
  to_virtual_account: uuidSchema,
  amount: amountSchema,
});

/**
 * Схема для transfer_between_virtual_accounts_v2
 */
export const transferBetweenAccountsV2Schema = z.object({
  from_virtual_account: uuidSchema,
  to_virtual_account: uuidSchema,
  amount: amountSchema,
  purpose: purposeSchema,
  ext_key: uuidSchema.optional(), // для идемпотентности
});

/**
 * Схема для get_virtual_accounts_transfer
 */
export const getVirtualAccountsTransferSchema = z.object({
  transfer_id: uuidSchema,
});

// ==================== Схемы для платежей ====================

/**
 * Enum для статуса платежа
 */
export const paymentStatusEnum = z.enum([
  'new',
  'in_process',
  'executed',
  'rejected',
  'returned',
]);

/**
 * Enum для типа платежа
 */
export const paymentTypeEnum = z.enum([
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
]);

/**
 * Datetime с timezone в формате YYYY-MM-DD HH:MM:SS+TZ
 */
export const datetimeWithTzSchema = z.string()
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}$/,
    'Дата должна быть в формате YYYY-MM-DD HH:MM:SS+TZ (например, 2024-01-15 14:30:00+03)'
  );

/**
 * Схема фильтров для list_payments_v2
 */
export const paymentFiltersSchema = z.object({
  account: accountNumberSchema.optional(),
  bic: bankCodeSchema.optional(),
  status: z.union([
    paymentStatusEnum,
    z.array(paymentStatusEnum),
  ]).optional(),
  type: z.union([
    paymentTypeEnum,
    z.array(paymentTypeEnum),
  ]).optional(),
  create_date: dateSchema.optional(),
  update_date: dateSchema.optional(),
  updated_at_from: datetimeWithTzSchema.optional(),
  updated_at_to: datetimeWithTzSchema.optional(),
  incoming: z.boolean().optional(),
  identify: z.boolean().optional(),
  c2b_qr_code_id: uuidSchema.optional(),
}).strict();

/**
 * Схема для list_payments_v2
 */
export const listPaymentsV2Schema = z.object({
  page: z.number().int().positive().default(1),
  per_page: z.number().int().min(1).max(1000).default(100),
  filters: paymentFiltersSchema.optional(),
});

/**
 * Схема для get_payment
 */
export const getPaymentSchema = z.object({
  payment_id: uuidSchema,
});

/**
 * Схема owner для идентификации платежа
 */
export const paymentOwnerSchema = z.object({
  virtual_account: uuidSchema,
  amount: amountSchema,
});

/**
 * Схема для identification_payment
 */
export const identifyPaymentSchema = z.object({
  payment_id: uuidSchema,
  is_returned_payment: z.boolean().default(false),
  owners: z.array(paymentOwnerSchema).min(1, 'Требуется минимум один owner'),
});

/**
 * Валидация суммы идентификации
 * Проверяет, что сумма всех owners равна сумме платежа
 */
export function validateIdentifyAmounts(
  paymentAmount: number,
  owners: Array<{ amount: number }>
): { valid: boolean; error?: string } {
  const total = owners.reduce((sum, o) => sum + o.amount, 0);
  const rounded = Math.round(total * 100) / 100;
  const paymentRounded = Math.round(paymentAmount * 100) / 100;

  if (Math.abs(rounded - paymentRounded) > 0.01) {
    return {
      valid: false,
      error: `Сумма owners (${rounded.toFixed(2)} руб.) не совпадает с суммой платежа (${paymentRounded.toFixed(2)} руб.)`,
    };
  }
  return { valid: true };
}

/**
 * Проверяет, можно ли идентифицировать платёж данного типа
 */
export function canIdentifyPaymentType(type: string): boolean {
  const unidentifiableTypes = [
    'incoming_unrecognized',
    'unrecognized_refund',
    'unrecognized_refund_sbp',
  ];
  return !unidentifiableTypes.includes(type);
}

// ==================== Типы из схем ====================

export type CreateVirtualAccountParams = z.infer<typeof createVirtualAccountSchema>;
export type GetVirtualAccountParams = z.infer<typeof getVirtualAccountSchema>;
export type ListVirtualAccountsParams = z.infer<typeof listVirtualAccountsSchema>;
export type ListVirtualTransactionsParams = z.infer<typeof listVirtualTransactionsSchema>;
export type RefundVirtualAccountParams = z.infer<typeof refundVirtualAccountSchema>;
export type TransferBetweenAccountsParams = z.infer<typeof transferBetweenAccountsSchema>;
export type TransferBetweenAccountsV2Params = z.infer<typeof transferBetweenAccountsV2Schema>;
export type GetVirtualAccountsTransferParams = z.infer<typeof getVirtualAccountsTransferSchema>;

// Payment types
export type PaymentFiltersParams = z.infer<typeof paymentFiltersSchema>;
export type ListPaymentsV2SchemaParams = z.infer<typeof listPaymentsV2Schema>;
export type GetPaymentParams = z.infer<typeof getPaymentSchema>;
export type IdentifyPaymentSchemaParams = z.infer<typeof identifyPaymentSchema>;
export type PaymentOwnerParams = z.infer<typeof paymentOwnerSchema>;

// ==================== Утилиты валидации ====================

/**
 * Валидирует параметры и возвращает ошибки или null
 */
export function validateParams<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}

/**
 * Маскирует чувствительные данные для логирования
 */
export function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...data };

  // Маскируем банковские реквизиты
  if (typeof masked.account === 'string' && masked.account.length >= 4) {
    masked.account = '****' + masked.account.slice(-4);
  }
  if (typeof masked.bank_code === 'string' && masked.bank_code.length >= 4) {
    masked.bank_code = '****' + masked.bank_code.slice(-4);
  }

  // Маскируем ИНН (оставляем первые 2 и последние 2 цифры)
  if (typeof masked.inn === 'string' && masked.inn.length >= 4) {
    masked.inn = masked.inn.slice(0, 2) + '****' + masked.inn.slice(-2);
  }

  // Рекурсивно обрабатываем вложенные объекты
  if (masked.recipient && typeof masked.recipient === 'object') {
    masked.recipient = maskSensitiveData(masked.recipient as Record<string, unknown>);
  }

  return masked;
}

/**
 * Форматирует сумму с 2 знаками после запятой
 */
export function formatAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}
