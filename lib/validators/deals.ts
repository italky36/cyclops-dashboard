/**
 * Zod-валидаторы для раздела "Сделки" (Deals) Cyclops API
 */

import { z } from 'zod';

// ==================== Регулярные выражения ====================

/**
 * Допустимые символы для текстовых полей
 */
const ALLOWED_TEXT_REGEX = /^[ -~№А-яёЁ\t\n\r]*$/;

/**
 * Идентификатор: цифры, буквы (латиница/кириллица), спецсимволы
 */
const IDENTIFIER_REGEX = /^[0-9A-Za-zА-яЁё\t\n\r \-\/:\-@\[\-`\{-~№]{1,60}$/;

// ==================== Базовые схемы ====================

/**
 * Сумма: положительное число с максимум 2 знаками после запятой
 */
export const amountSchema = z.number()
  .positive('Сумма должна быть положительной')
  .multipleOf(0.01, 'Сумма может иметь максимум 2 знака после запятой');

/**
 * Номер счёта: ровно 20 цифр
 */
export const accountSchema = z.string()
  .length(20, 'Номер счёта должен содержать ровно 20 цифр')
  .regex(/^\d+$/, 'Номер счёта должен состоять только из цифр');

/**
 * БИК банка: ровно 9 цифр
 */
export const bankCodeSchema = z.string()
  .length(9, 'БИК банка должен содержать ровно 9 цифр')
  .regex(/^\d+$/, 'БИК должен состоять только из цифр');

/**
 * ИНН: 10 или 12 цифр
 */
export const innSchema = z.string()
  .regex(/^\d{10}$|^\d{12}$/, 'ИНН должен содержать 10 или 12 цифр');

/**
 * ИНН юрлица: ровно 10 цифр
 */
export const innUlSchema = z.string()
  .regex(/^\d{10}$/, 'ИНН юрлица должен содержать ровно 10 цифр');

/**
 * ИНН физлица/ИП: ровно 12 цифр
 */
export const innFlSchema = z.string()
  .regex(/^\d{12}$/, 'ИНН физлица должен содержать ровно 12 цифр');

/**
 * КПП: ровно 9 цифр
 */
export const kppSchema = z.string()
  .length(9, 'КПП должен содержать ровно 9 цифр')
  .regex(/^\d+$/, 'КПП должен состоять только из цифр');

/**
 * Номер телефона для СБП: 11 символов, начинается с "7"
 */
export const phoneNumberSbpSchema = z.string()
  .length(11, 'Номер телефона должен содержать 11 цифр')
  .startsWith('7', 'Номер телефона должен начинаться с 7')
  .regex(/^\d+$/, 'Номер телефона должен состоять только из цифр');

/**
 * UUID виртуального счёта
 */
export const virtualAccountSchema = z.string()
  .uuid('Некорректный формат UUID виртуального счёта');

/**
 * Наименование получателя
 */
export const nameSchema = z.string()
  .min(1, 'Наименование обязательно')
  .regex(ALLOWED_TEXT_REGEX, 'Наименование содержит недопустимые символы');

/**
 * Номер документа: до 6 символов
 */
export const documentNumberSchema = z.string()
  .max(6, 'Номер документа может содержать максимум 6 символов');

/**
 * Идентификатор: 1-60 символов
 */
export const identifierSchema = z.string()
  .min(1, 'Идентификатор должен содержать минимум 1 символ')
  .max(60, 'Идентификатор может содержать максимум 60 символов')
  .regex(IDENTIFIER_REGEX, 'Идентификатор содержит недопустимые символы');

/**
 * Назначение платежа для СБП: до 140 символов
 */
export const purposeSbpSchema = z.string()
  .max(140, 'Назначение платежа для СБП может содержать максимум 140 символов');

/**
 * Назначение платежа стандартное: до 210 символов
 */
export const purposeSchema = z.string()
  .max(210, 'Назначение платежа может содержать максимум 210 символов');

/**
 * Дата в формате YYYY-MM-DD
 */
export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD');

/**
 * ISO datetime
 */
export const datetimeSchema = z.string()
  .datetime({ message: 'Дата должна быть в формате ISO datetime' });

/**
 * КБК: 20 цифр
 */
export const kbkSchema = z.string()
  .length(20, 'КБК должен содержать ровно 20 цифр')
  .regex(/^\d+$/, 'КБК должен состоять только из цифр');

/**
 * ОКТМО: 8 цифр
 */
export const oktmoSchema = z.string()
  .length(8, 'ОКТМО должен содержать ровно 8 цифр')
  .regex(/^\d+$/, 'ОКТМО должен состоять только из цифр');

// ==================== Enum схемы ====================

/**
 * Статус сделки
 */
export const dealStatusSchema = z.enum([
  'new',
  'in_process',
  'partial',
  'closed',
  'rejected',
  'correction',
  'canceled_by_platform',
]);

/**
 * Тип получателя
 */
export const recipientTypeSchema = z.enum([
  'payment_contract',
  'commission',
  'ndfl',
  'ndfl_to_virtual_account',
  'payment_contract_by_sbp',
  'payment_contract_by_sbp_v2',
  'payment_contract_to_card',
]);

/**
 * Код назначения платежа
 */
export const codePurposeSchema = z.enum(['1', '2', '3', '4', '5']);

/**
 * Тип назначения для комиссии
 */
export const purposeTypeSchema = z.enum(['standard', 'with_inn']);

/**
 * Поля для выборки в списке сделок
 */
export const dealFieldNameSchema = z.enum([
  'amount',
  'status',
  'created_at',
  'updated_at',
  'ext_key',
]);

// ==================== Схемы плательщика ====================

/**
 * Документ сделки
 */
export const dealDocumentSchema = z.object({
  type: z.string(),
  file_name: z.string().optional(),
  content_base64: z.string().optional(),
});

/**
 * Плательщик (полная версия)
 */
export const dealPayerSchema = z.object({
  virtual_account: virtualAccountSchema,
  amount: amountSchema,
  executed: z.boolean().nullable().optional(),
  documents: z.array(dealDocumentSchema).optional(),
});

/**
 * Плательщик для создания сделки
 */
export const dealPayerInputSchema = z.object({
  virtual_account: virtualAccountSchema,
  amount: amountSchema,
});

// ==================== Схемы получателей ====================

/**
 * Базовые поля получателя
 */
const recipientBaseSchema = z.object({
  number: z.number().int().positive('Номер получателя должен быть положительным целым числом'),
  amount: amountSchema,
});

/**
 * Получатель payment_contract - оплата по договору
 */
export const paymentContractRecipientSchema = recipientBaseSchema.extend({
  type: z.literal('payment_contract'),
  account: accountSchema,
  bank_code: bankCodeSchema,
  name: nameSchema,
  inn: innSchema,
  kpp: kppSchema.optional(),
  purpose: purposeSchema.optional(),
  purpose_nds: z.number().min(0).max(100).optional(),
  document_number: documentNumberSchema.optional(),
  identifier: identifierSchema.optional(),
  code_purpose: codePurposeSchema.optional(),
});

/**
 * Получатель commission - комиссия площадки
 */
export const commissionRecipientSchema = recipientBaseSchema.extend({
  type: z.literal('commission'),
  name: nameSchema,
  kpp: kppSchema.optional(),
  purpose: purposeSchema.optional(),
  purpose_nds: z.number().min(0).max(100).optional(),
  purpose_type: purposeTypeSchema.optional(),
  document_number: documentNumberSchema.optional(),
});

/**
 * Получатель СБП (v1)
 */
export const sbpV1RecipientSchema = recipientBaseSchema.extend({
  type: z.literal('payment_contract_by_sbp'),
  first_name: z.string().min(1, 'Имя обязательно'),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, 'Фамилия обязательна'),
  phone_number: phoneNumberSbpSchema,
  bank_sbp_id: z.string().min(1, 'ID банка СБП обязателен'),
  purpose: purposeSbpSchema.optional(),
  purpose_nds: z.number().min(0).max(100).optional(),
  identifier: identifierSchema.optional(),
  inn: innFlSchema.optional(),
});

/**
 * Получатель СБП (v2)
 */
export const sbpV2RecipientSchema = recipientBaseSchema.extend({
  type: z.literal('payment_contract_by_sbp_v2'),
  first_name: z.string().min(1, 'Имя обязательно'),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, 'Фамилия обязательна'),
  phone_number: phoneNumberSbpSchema,
  bank_sbp_id: z.string().min(1, 'ID банка СБП обязателен'),
  purpose: purposeSbpSchema.optional(),
  purpose_nds: z.number().min(0).max(100).optional(),
  identifier: identifierSchema.optional(),
  inn: innFlSchema.optional(),
});

/**
 * Получатель на карту
 */
export const cardRecipientSchema = recipientBaseSchema.extend({
  type: z.literal('payment_contract_to_card'),
  card_number_crypto_base64: z.string().min(1, 'Зашифрованный номер карты обязателен'),
  purpose: purposeSchema.optional(),
  document_number: documentNumberSchema.optional(),
  identifier: identifierSchema.optional(),
  inn: innSchema.optional(),
});

/**
 * Налоговые поля для НДФЛ
 */
export const ndflTaxFieldsSchema = z.object({
  field107: z.string().optional(),
  type: z.string().optional(),
  status: z.string().regex(/^(0[1-9]|1[0-5])$/, 'Статус должен быть от 01 до 15').optional(),
  document_date: z.union([
    dateSchema,
    z.literal('0'),
  ]).optional(),
});

/**
 * ФИО получателя НДФЛ
 */
export const recipientFioSchema = z.object({
  first_name: z.string().min(1, 'Имя обязательно'),
  last_name: z.string().min(1, 'Фамилия обязательна'),
  middle_name: z.string().optional(),
});

/**
 * Получатель НДФЛ
 */
export const ndflRecipientSchema = recipientBaseSchema.extend({
  type: z.literal('ndfl'),
  account: accountSchema,
  bank_code: bankCodeSchema,
  inn: innUlSchema,
  purpose: z.string().min(1, 'Назначение платежа обязательно'),
  kbk: kbkSchema,
  oktmo: oktmoSchema,
  base: z.string().min(1, 'Основание налогового платежа обязательно'),
  tax_fields: ndflTaxFieldsSchema,
  recipient_fio: recipientFioSchema.optional(),
});

/**
 * Получатель ndfl_to_virtual_account
 */
export const ndflToVirtualAccountRecipientSchema = recipientBaseSchema.extend({
  type: z.literal('ndfl_to_virtual_account'),
  virtual_account: virtualAccountSchema,
});

/**
 * Union-схема всех типов получателей
 */
export const dealRecipientSchema = z.discriminatedUnion('type', [
  paymentContractRecipientSchema,
  commissionRecipientSchema,
  sbpV1RecipientSchema,
  sbpV2RecipientSchema,
  cardRecipientSchema,
  ndflRecipientSchema,
  ndflToVirtualAccountRecipientSchema,
]);

// ==================== Схемы фильтров ====================

/**
 * Фильтры списка сделок
 */
export const listDealsFiltersSchema = z.object({
  status: dealStatusSchema.optional(),
  ext_key: z.string().optional(),
  created_date_from: dateSchema.optional(),
  created_date_to: dateSchema.optional(),
  updated_at_from: datetimeSchema.optional(),
  updated_at_to: datetimeSchema.optional(),
});

// ==================== Схемы параметров запросов ====================

/**
 * Параметры создания сделки
 */
export const createDealParamsSchema = z.object({
  ext_key: z.string().optional(),
  amount: amountSchema,
  payers: z.array(dealPayerInputSchema).min(1, 'Требуется минимум один плательщик'),
  recipients: z.array(dealRecipientSchema).min(1, 'Требуется минимум один получатель'),
}).refine(
  (data) => {
    // Проверяем, что номера получателей уникальны
    const numbers = data.recipients.map(r => r.number);
    return new Set(numbers).size === numbers.length;
  },
  { message: 'Номера получателей должны быть уникальными в рамках сделки' }
).refine(
  (data) => {
    // Проверяем, что сумма плательщиков равна общей сумме
    const payersTotal = data.payers.reduce((sum, p) => sum + p.amount, 0);
    return Math.abs(payersTotal - data.amount) < 0.01;
  },
  { message: 'Сумма плательщиков должна равняться общей сумме сделки' }
).refine(
  (data) => {
    // Проверяем, что сумма получателей равна общей сумме
    const recipientsTotal = data.recipients.reduce((sum, r) => sum + r.amount, 0);
    return Math.abs(recipientsTotal - data.amount) < 0.01;
  },
  { message: 'Сумма получателей должна равняться общей сумме сделки' }
);

/**
 * Параметры списка сделок
 */
export const listDealsParamsSchema = z.object({
  page: z.number().int().positive().default(1),
  per_page: z.number().int().min(1).max(1000).default(100),
  field_names: z.array(dealFieldNameSchema).optional(),
  filters: listDealsFiltersSchema.optional(),
});

/**
 * Получатель для частичного исполнения
 */
export const recipientExecuteSchema = z.object({
  number: z.number().int().positive('Номер получателя должен быть положительным целым числом'),
});

/**
 * Параметры исполнения сделки
 */
export const executeDealParamsSchema = z.object({
  deal_id: z.string().uuid('Некорректный формат deal_id'),
  recipients_execute: z.array(recipientExecuteSchema).optional(),
});

/**
 * Параметры отмены сделки
 */
export const cancelDealParamsSchema = z.object({
  deal_id: z.string().uuid('Некорректный формат deal_id'),
});

/**
 * Параметры получения сделки
 */
export const getDealParamsSchema = z.object({
  deal_id: z.string().uuid('Некорректный формат deal_id'),
});

/**
 * Данные для обновления сделки
 */
export const updateDealDataSchema = z.object({
  recipients: z.array(dealRecipientSchema).optional(),
  payers: z.array(dealPayerInputSchema).optional(),
}).passthrough(); // Разрешаем дополнительные поля

/**
 * Параметры обновления сделки
 */
export const updateDealParamsSchema = z.object({
  deal_id: z.string().uuid('Некорректный формат deal_id'),
  deal_data: updateDealDataSchema,
});

// ==================== Схемы ответов API ====================

/**
 * Сообщение комплаенс-проверки
 */
export const complianceMessageSchema = z.object({
  level: z.enum(['ERROR', 'WARNING']),
  text: z.string(),
});

/**
 * Результат комплаенс-проверки получателя
 */
export const complianceCheckPaymentSchema = z.object({
  number: z.number().int(),
  approved: z.boolean(),
  messages: z.array(complianceMessageSchema),
});

/**
 * Ответ на создание сделки
 */
export const createDealResponseSchema = z.object({
  deal_id: z.string(),
  compliance_check_payments: z.array(complianceCheckPaymentSchema),
});

/**
 * Метаданные пагинации
 */
export const paginationMetaSchema = z.object({
  total: z.number().int(),
  page: z.object({
    current_page: z.number().int(),
    per_page: z.number().int(),
  }),
});

/**
 * Элемент списка сделок
 */
export const dealListItemSchema = z.object({
  id: z.string(),
  status: dealStatusSchema.optional(),
  amount: z.number().optional(),
  ext_key: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

/**
 * Ответ на список сделок
 */
export const listDealsResponseSchema = z.object({
  deals: z.array(dealListItemSchema),
  meta: paginationMetaSchema,
});

// ==================== Экспорт типов из схем ====================

export type DealStatus = z.infer<typeof dealStatusSchema>;
export type RecipientType = z.infer<typeof recipientTypeSchema>;
export type DealFieldName = z.infer<typeof dealFieldNameSchema>;

export type DealDocument = z.infer<typeof dealDocumentSchema>;
export type DealPayer = z.infer<typeof dealPayerSchema>;
export type DealPayerInput = z.infer<typeof dealPayerInputSchema>;

export type PaymentContractRecipient = z.infer<typeof paymentContractRecipientSchema>;
export type CommissionRecipient = z.infer<typeof commissionRecipientSchema>;
export type SbpV1Recipient = z.infer<typeof sbpV1RecipientSchema>;
export type SbpV2Recipient = z.infer<typeof sbpV2RecipientSchema>;
export type CardRecipient = z.infer<typeof cardRecipientSchema>;
export type NdflRecipient = z.infer<typeof ndflRecipientSchema>;
export type NdflToVirtualAccountRecipient = z.infer<typeof ndflToVirtualAccountRecipientSchema>;
export type DealRecipient = z.infer<typeof dealRecipientSchema>;

export type ListDealsFilters = z.infer<typeof listDealsFiltersSchema>;
export type CreateDealParams = z.infer<typeof createDealParamsSchema>;
export type ListDealsParams = z.infer<typeof listDealsParamsSchema>;
export type ExecuteDealParams = z.infer<typeof executeDealParamsSchema>;
export type CancelDealParams = z.infer<typeof cancelDealParamsSchema>;
export type GetDealParams = z.infer<typeof getDealParamsSchema>;
export type UpdateDealParams = z.infer<typeof updateDealParamsSchema>;

export type ComplianceMessage = z.infer<typeof complianceMessageSchema>;
export type ComplianceCheckPayment = z.infer<typeof complianceCheckPaymentSchema>;
export type CreateDealResponse = z.infer<typeof createDealResponseSchema>;
export type DealListItem = z.infer<typeof dealListItemSchema>;
export type ListDealsResponse = z.infer<typeof listDealsResponseSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
