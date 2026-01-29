/**
 * Типы для раздела "Сделки" (Deals) Cyclops API
 * Документация: Cyclops API банка Точка
 */

// ==================== Статусы ====================

/**
 * Статусы сделки
 */
export type DealStatus =
  | 'new'
  | 'in_process'
  | 'partial'
  | 'closed'
  | 'rejected'
  | 'correction'
  | 'canceled_by_platform';

/**
 * Статусы получателя в сделке
 */
export type DealRecipientStatus =
  | 'new'
  | 'in_process'
  | 'reject'
  | 'success'
  | 'old';

/**
 * Статусы платежа
 */
export type DealPaymentStatus =
  | 'NEW'
  | 'CREATED'
  | 'WAIT_PAID'
  | 'WAIT_VERIFY'
  | 'WAIT_SEND'
  | 'PAID'
  | 'K2'
  | 'CANCELED';

// ==================== Типы получателей ====================

/**
 * Типы получателей (7 типов)
 */
export type RecipientType =
  | 'payment_contract'           // Оплата по договору (счёт + БИК + ИНН)
  | 'commission'                 // Комиссия площадки
  | 'ndfl'                       // Бюджетный платёж (налоги)
  | 'ndfl_to_virtual_account'    // Сбор налогов на ВС
  | 'payment_contract_by_sbp'    // СБП старый флоу
  | 'payment_contract_by_sbp_v2' // СБП новый флоу
  | 'payment_contract_to_card';  // Выплата на карту

// ==================== Документы ====================

/**
 * Документ сделки
 */
export interface DealDocument {
  type: string;
  file_name?: string;
  content_base64?: string;
  success_added?: boolean;
  success_added_desc?: string;
}

// ==================== Плательщик ====================

/**
 * Плательщик в сделке
 */
export interface DealPayer {
  virtual_account: string;   // UUID виртуального счёта
  amount: number;            // Сумма (2 знака после запятой)
  executed?: boolean | null;
  documents?: DealDocument[];
}

/**
 * Плательщик для создания сделки (упрощённая версия)
 */
export interface DealPayerInput {
  virtual_account: string;
  amount: number;
}

// ==================== Получатели (Recipients) ====================

/**
 * Базовый интерфейс получателя
 */
export interface RecipientBase {
  number: number;   // Уникальный номер в рамках сделки
  amount: number;   // Не более 2 знаков после запятой
}

/**
 * Получатель payment_contract - оплата по договору
 */
export interface PaymentContractRecipient extends RecipientBase {
  type: 'payment_contract';
  account: string;           // Счёт, 20 цифр
  bank_code: string;         // БИК, 9 цифр
  name: string;              // Наименование (regex: ^[ -~№А-яёЁ\t\n\r]*$)
  inn: string;               // 10 или 12 цифр
  kpp?: string;              // 9 цифр, опционально
  purpose?: string;          // Назначение платежа
  purpose_nds?: number;      // Процент НДС
  document_number?: string;  // До 6 символов
  identifier?: string;       // 1-60 символов
  code_purpose?: '1' | '2' | '3' | '4' | '5';
}

/**
 * Получатель commission - комиссия площадки
 */
export interface CommissionRecipient extends RecipientBase {
  type: 'commission';
  name: string;
  kpp?: string;
  purpose?: string;          // Полное назначение ИЛИ:
  purpose_nds?: number;      // НДС %
  purpose_type?: 'standard' | 'with_inn';
  document_number?: string;
}

/**
 * Получатель СБП (v1 и v2)
 */
export interface SbpRecipient extends RecipientBase {
  type: 'payment_contract_by_sbp' | 'payment_contract_by_sbp_v2';
  first_name: string;
  middle_name?: string;      // Если есть отчество
  last_name: string;
  phone_number: string;      // 11 символов, начинается с "7"
  bank_sbp_id: string;       // ID банка из list_bank_sbp
  purpose?: string;          // До 140 символов
  purpose_nds?: number;
  identifier?: string;
  inn?: string;              // 12 цифр, опционально
}

/**
 * Получатель на карту
 */
export interface CardRecipient extends RecipientBase {
  type: 'payment_contract_to_card';
  card_number_crypto_base64: string;  // Зашифрованный RSA OAEP номер карты
  purpose?: string;          // До 210 символов (50 для B2B)
  document_number?: string;
  identifier?: string;
  inn?: string;
}

/**
 * Налоговые поля для НДФЛ
 */
export interface NdflTaxFields {
  field107?: string;       // Период оплаты
  type?: string;           // Вид платежа
  status?: string;         // Статус плательщика (01-15)
  document_date?: string;  // YYYY-MM-DD или "0"
}

/**
 * ФИО получателя НДФЛ
 */
export interface RecipientFio {
  first_name: string;
  last_name: string;
  middle_name?: string;
}

/**
 * Получатель НДФЛ
 */
export interface NdflRecipient extends RecipientBase {
  type: 'ndfl';
  account: string;           // 20 цифр
  bank_code: string;         // 9 цифр
  inn: string;               // 10 цифр
  purpose: string;
  kbk: string;               // 20 цифр
  oktmo: string;             // 8 цифр
  base: string;              // Основание налогового платежа
  tax_fields: NdflTaxFields;
  recipient_fio?: RecipientFio;
}

/**
 * Получатель ndfl_to_virtual_account - сбор налогов на ВС
 */
export interface NdflToVirtualAccountRecipient extends RecipientBase {
  type: 'ndfl_to_virtual_account';
  virtual_account: string;   // ВС типа for_ndfl
}

/**
 * Union-тип всех получателей
 */
export type DealRecipient =
  | PaymentContractRecipient
  | CommissionRecipient
  | SbpRecipient
  | CardRecipient
  | NdflRecipient
  | NdflToVirtualAccountRecipient;

// ==================== Информация о получателе (из get_deal) ====================

/**
 * Метаданные платежа
 */
export interface DealPaymentMeta {
  rrn?: string;
  error_code?: number;
  code_description?: string;
}

/**
 * Информация о платеже получателя
 */
export interface DealRecipientPayment {
  id: string;
  status: DealPaymentStatus;
  meta?: DealPaymentMeta;
}

/**
 * Информация о получателе (из get_deal)
 */
export interface DealRecipientInfo {
  number: number;
  amount: number;
  status: DealRecipientStatus;
  executed: boolean | null;
  requisites: Record<string, unknown>;
  type: RecipientType;
  payment?: DealRecipientPayment;
  error_reason?: string;
}

// ==================== Сделка ====================

/**
 * Сделка (полная информация)
 */
export interface Deal {
  id: string;
  ext_key?: string;
  amount: number;
  status: DealStatus;
  payers: DealPayer[];
  recipients: DealRecipientInfo[];
  created_at: string;
  updated_at: string;
}

/**
 * Элемент списка сделок (сокращённая информация)
 */
export interface DealListItem {
  id: string;
  status?: DealStatus;
  amount?: number;
  ext_key?: string;
  created_at?: string;
  updated_at?: string;
}

// ==================== Параметры запросов ====================

/**
 * Параметры создания сделки
 */
export interface CreateDealParams {
  ext_key?: string;
  amount: number;
  payers: DealPayerInput[];
  recipients: DealRecipient[];
}

/**
 * Поля для выборки в списке сделок
 */
export type DealFieldName = 'amount' | 'status' | 'created_at' | 'updated_at' | 'ext_key';

/**
 * Фильтры списка сделок
 */
export interface ListDealsFilters {
  status?: DealStatus;
  ext_key?: string;
  created_date_from?: string;   // YYYY-MM-DD
  created_date_to?: string;
  updated_at_from?: string;     // ISO datetime
  updated_at_to?: string;
}

/**
 * Параметры списка сделок
 */
export interface ListDealsParams {
  page?: number;              // По умолчанию 1
  per_page?: number;          // По умолчанию 100, макс 1000
  field_names?: DealFieldName[];
  filters?: ListDealsFilters;
}

/**
 * Получатель для частичного исполнения
 */
export interface RecipientExecute {
  number: number;
}

/**
 * Параметры исполнения сделки
 */
export interface ExecuteDealParams {
  deal_id: string;
  recipients_execute?: RecipientExecute[];  // Для частичного исполнения
}

/**
 * Параметры отмены сделки
 */
export interface CancelDealParams {
  deal_id: string;
}

/**
 * Параметры получения сделки
 */
export interface GetDealParams {
  deal_id: string;
}

// ==================== Ответы API ====================

/**
 * Сообщение комплаенс-проверки
 */
export interface ComplianceMessage {
  level: 'ERROR' | 'WARNING';
  text: string;
}

/**
 * Результат комплаенс-проверки получателя
 */
export interface ComplianceCheckPayment {
  number: number;
  approved: boolean;
  messages: ComplianceMessage[];
}

/**
 * Ответ на создание сделки
 */
export interface CreateDealResponse {
  deal_id: string;
  compliance_check_payments: ComplianceCheckPayment[];
}

/**
 * Метаданные пагинации
 */
export interface PaginationMeta {
  total: number;
  page: {
    current_page: number;
    per_page: number;
  };
}

/**
 * Ответ на список сделок
 */
export interface ListDealsResponse {
  deals: DealListItem[];
  meta: PaginationMeta;
}

/**
 * Ответ на получение сделки
 */
export interface GetDealResponse {
  deal: Deal;
}

/**
 * Ответ на исполнение сделки
 */
export interface ExecuteDealResponse {
  deal_id: string;
  status: DealStatus;
}

/**
 * Ответ на отмену сделки
 */
export interface CancelDealResponse {
  deal_id: string;
  status: DealStatus;
}
