// Cyclops API Types

export type Layer = 'pre' | 'prod';

export interface CyclopsConfig {
  layer: Layer;
  privateKey: string;
  signSystem: string;
  signThumbprint: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: Record<string, unknown>;
  id: string;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
    meta?: unknown;
  };
}

// Beneficiary Types
export type BeneficiaryType = 'ul' | 'ip' | 'fl';
export type BeneficiaryLegalType = 'F' | 'I' | 'J';

export type BeneficiaryDocumentType = 'internal_passport' | 'inn_f';

export interface BeneficiaryDocumentBase {
  type: BeneficiaryDocumentType;
}

export interface BeneficiaryDocumentPassport extends BeneficiaryDocumentBase {
  type: 'internal_passport';
  series: string;
  number: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  birth_date: string;
  issuer_code: string;
  issue_date: string;
}

export interface BeneficiaryDocumentInn extends BeneficiaryDocumentBase {
  type: 'inn_f';
  inn: string;
  birth_place: string;
}

export type BeneficiaryDocumentInput = BeneficiaryDocumentPassport | BeneficiaryDocumentInn;

export interface AddBeneficiaryDocumentsParams extends Record<string, unknown> {
  beneficiary_id: string;
  documents: BeneficiaryDocumentInput[];
}

export interface BeneficiaryDocumentResponse extends BeneficiaryDocumentBase {
  id?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  birth_place?: string;
  birth_date?: string;
  inn?: string;
  series?: string;
  number?: string;
  issuer_code?: string;
  issue_date?: string;
  expired_at?: string | null;
}

export interface AddBeneficiaryDocumentsResult {
  beneficiary_id: string;
  documents: BeneficiaryDocumentResponse[];
}

export interface UpdateBeneficiaryUlParams extends Record<string, unknown> {
  beneficiary_id: string;
  beneficiary_data: {
    name: string;
    kpp: string;
    ogrn?: string;
    is_active_activity?: boolean;
  };
}

export interface UpdateBeneficiaryIpParams extends Record<string, unknown> {
  beneficiary_id: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    tax_resident?: boolean;
  };
}

export interface UpdateBeneficiaryFlParams extends Record<string, unknown> {
  beneficiary_id: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    birth_date: string;
    birth_place: string;
    passport_series: string;
    passport_number: string;
    passport_date: string;
    registration_address: string;
    tax_resident?: boolean;
  };
}

export interface UpdateBeneficiaryResult {
  beneficiary: {
    inn?: string;
    id?: string;
  };
}

export interface BeneficiaryUL {
  type: 'ul';
  inn: string;
  name: string;
  kpp: string;
}

export interface BeneficiaryIP {
  type: 'ip';
  inn: string;
  nominal_account_code?: string;
  nominal_account_bic?: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    tax_resident?: boolean;
  };
}

export interface BeneficiaryFL {
  type: 'fl';
  inn: string;
  nominal_account_code?: string;
  nominal_account_bic?: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    birth_date: string;
    birth_place: string;
    passport_series: string;
    passport_number: string;
    passport_date: string;
    registration_address: string;
    resident?: boolean;
    reg_country_code?: string;
    tax_resident?: boolean;
  };
}

export type Beneficiary = BeneficiaryUL | BeneficiaryIP | BeneficiaryFL;

export interface BeneficiaryResponse {
  beneficiary_id: string;
  is_active: boolean;
  is_added_to_ms: boolean;
  created_at: string;
}

export interface BeneficiaryListItem {
  id?: string;
  beneficiary_id?: string;
  inn?: string;
  is_active?: boolean;
  legal_type?: string;
  nominal_account_code?: string;
  nominal_account_bic?: string;
  beneficiary_data?: {
    name?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    kpp?: string;
    ogrn?: string;
    ogrnip?: string;
    is_active_activity?: boolean;
    birth_date?: string;
    birth_place?: string;
    passport_series?: string;
    passport_number?: string;
    passport_date?: string;
    registration_address?: string;
    tax_resident?: boolean;
  };
  is_added_to_ms?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ListBeneficiariesResult {
  beneficiaries: BeneficiaryListItem[];
  meta?: {
    total?: number;
    page?: {
      current_page?: number;
      per_page?: number;
    };
  };
}

export interface BeneficiaryDetail {
  id?: string;
  beneficiary_id?: string;
  inn?: string;
  is_active?: boolean;
  legal_type?: string;
  beneficiary_data?: {
    name?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    kpp?: string;
    ogrn?: string;
    ogrnip?: string;
    is_active_activity?: boolean;
    birth_date?: string;
    birth_place?: string;
    passport_series?: string;
    passport_number?: string;
    passport_date?: string;
    registration_address?: string;
    resident?: boolean;
    reg_country_code?: string;
    tax_resident?: boolean;
  };
  nominal_account?: {
    code?: string;
    bic?: string;
  };
  nominal_account_code?: string;
  nominal_account_bic?: string;
  is_added_to_ms?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GetBeneficiaryResult {
  beneficiary: BeneficiaryDetail;
  nominal_account?: {
    code?: string;
    bic?: string;
  };
  last_contract_offer?: {
    id?: string;
    type?: string;
    success_added?: boolean;
    success_added_desc?: string;
  };
  permission?: boolean;
  permission_description?: string | null;
}

// Virtual Account Types
export type VirtualAccountType = 'standard' | 'for_ndfl';

export interface VirtualAccount {
  code: string;
  cash: number;
  blocked_cash: number;
  beneficiary_id: string;
  beneficiary_inn?: string;
  type?: VirtualAccountType;
}

export interface CreateVirtualAccountParams {
  beneficiary_id: string;
  type: VirtualAccountType;
}

export interface ListVirtualAccountsResult {
  virtual_accounts: string[];
  meta?: {
    total?: number;
    page?: {
      current_page?: number;
      per_page?: number;
    };
  };
}

export interface GetVirtualAccountResult {
  virtual_account: VirtualAccount;
}

// Virtual Transaction Types
export type OperationType =
  | 'cash_add'
  | 'block_add'
  | 'block_add_from_cash'
  | 'cash_add_from_block'
  | 'block_write_off'
  | 'cash_write_off';

export interface VirtualTransaction {
  id: string;
  virtual_account: string;
  amount: number;
  operation_type: OperationType;
  deal_id?: string;
  payment_id?: string;
  created_at: string;
  incoming: boolean;
  description?: string;
}

export interface ListVirtualTransactionsParams {
  page?: number;
  per_page?: number;
  filters: {
    virtual_account?: string;
    deal_id?: string;
    payment_id?: string;
    created_date_from?: string;
    created_date_to?: string;
    incoming?: boolean;
    operation_type?: OperationType;
    include_block_operations?: boolean;
  };
}

export interface ListVirtualTransactionsResult {
  virtual_transactions: VirtualTransaction[];
  total_payouts: number;
  count_payouts: number;
  total_receipts: number;
  count_receipts: number;
  meta?: {
    total?: number;
    page?: {
      current_page?: number;
      per_page?: number;
    };
  };
}

// Refund Types
export interface RefundRecipient {
  amount: number;
  account: string;
  bank_code: string;
  name: string;
  inn?: string;
  kpp?: string;
  document_number?: string;
}

export interface RefundVirtualAccountParams {
  virtual_account: string;
  recipient: RefundRecipient;
  purpose?: string;
  ext_key?: string;
  identifier?: string;
}

export interface RefundVirtualAccountResult {
  payment_id: string;
}

// Transfer Types
export interface TransferBetweenAccountsParams {
  from_virtual_account: string;
  to_virtual_account: string;
  amount: number;
}

export interface TransferBetweenAccountsResult {
  success: boolean;
  transfer_id: string;
}

export type TransferStatus = 'PROCESSING' | 'SUCCESS' | 'CANCELED';

export interface TransferBetweenAccountsV2Params {
  from_virtual_account: string;
  to_virtual_account: string;
  amount: number;
  purpose?: string;
  ext_key?: string;
}

export interface TransferBetweenAccountsV2Result {
  transfer_id: string;
  status: TransferStatus;
}

export interface GetVirtualAccountsTransferResult {
  id: string;
  status: TransferStatus;
  amount: number;
  from_virtual_account: string;
  to_virtual_account: string;
  payment_id?: string;
}

// Cyclops Error Types
export interface CyclopsError {
  code: number;
  message: string;
  data?: unknown;
  meta?: unknown;
}

// Коды ошибок Cyclops
export const CYCLOPS_ERROR_CODES = {
  BENEFICIARY_NOT_FOUND: 4409,
  BENEFICIARY_NOT_ACTIVE: 4410,
  VIRTUAL_ACCOUNT_NOT_FOUND: 4411,
  PAYMENT_NOT_FOUND: 4412,
  PAYMENT_AMOUNT_MISMATCH: 4413,
  PAYMENT_ALREADY_IDENTIFIED: 4414,
  INSUFFICIENT_FUNDS: 4415,
  REFUND_ERROR: 4422,
  COMPLIANCE_ERROR: 4436,
  DOCUMENT_NOT_FOUND: 4406,
  INCORRECT_VO_CODES: 4451,
  RESTRICTIONS_IMPOSED: 4558,
  IDEMPOTENT_REQUEST_IN_PROCESS: 4909,
  TRANSFER_NOT_FOUND: 4905,
} as const;

export type CyclopsErrorCode = typeof CYCLOPS_ERROR_CODES[keyof typeof CYCLOPS_ERROR_CODES];

// Человекочитаемые сообщения для кодов ошибок
export const CYCLOPS_ERROR_MESSAGES: Record<number, string> = {
  [CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_FOUND]: 'Бенефициар не найден',
  [CYCLOPS_ERROR_CODES.BENEFICIARY_NOT_ACTIVE]: 'Бенефициар не активен',
  [CYCLOPS_ERROR_CODES.VIRTUAL_ACCOUNT_NOT_FOUND]: 'Виртуальный счёт не найден',
  [CYCLOPS_ERROR_CODES.PAYMENT_NOT_FOUND]: 'Платёж не найден',
  [CYCLOPS_ERROR_CODES.PAYMENT_AMOUNT_MISMATCH]: 'Суммы не совпадают',
  [CYCLOPS_ERROR_CODES.PAYMENT_ALREADY_IDENTIFIED]: 'Платёж уже идентифицирован',
  [CYCLOPS_ERROR_CODES.INSUFFICIENT_FUNDS]: 'Недостаточно средств на виртуальном счёте',
  [CYCLOPS_ERROR_CODES.REFUND_ERROR]: 'Ошибка возврата платежа',
  [CYCLOPS_ERROR_CODES.COMPLIANCE_ERROR]: 'Ошибка комплаенс-проверки',
  [CYCLOPS_ERROR_CODES.DOCUMENT_NOT_FOUND]: 'Документ не найден',
  [CYCLOPS_ERROR_CODES.INCORRECT_VO_CODES]: 'Некорректные или отсутствующие коды VO для платежа нерезиденту',
  [CYCLOPS_ERROR_CODES.RESTRICTIONS_IMPOSED]: 'Ограничения по ИП/исполнительному производству',
  [CYCLOPS_ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROCESS]: 'Запрос с таким ext_key уже обрабатывается',
  [CYCLOPS_ERROR_CODES.TRANSFER_NOT_FOUND]: 'Перевод между номинальными счетами не найден',
};

// Deal Types
export type RecipientType = 
  | 'payment_contract'      // По реквизитам
  | 'payment_contract_by_sbp' // СБП
  | 'payment_contract_to_card' // На карту
  | 'commission'            // Комиссия площадки
  | 'ndfl'                  // Налог
  | 'ndfl_to_virtual_account'; // НДФЛ на виртуальный счёт

export interface DealPayer {
  virtual_account: string;
  amount: number;
}

export interface RecipientBase {
  number?: number;
  amount: number;
}

export interface RecipientPaymentContract extends RecipientBase {
  type: 'payment_contract';
  account: string;
  bank_code: string;
  name: string;
  inn: string;
  kpp?: string;
  purpose: string;
  document_number?: string;
}

export interface RecipientSBP extends RecipientBase {
  type: 'payment_contract_by_sbp';
  phone_number: string;
  bank_sbp_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
}

export interface RecipientCard extends RecipientBase {
  type: 'payment_contract_to_card';
  card_number_encrypted: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
}

export interface RecipientCommission extends RecipientBase {
  type: 'commission';
}

export interface RecipientNDFL extends RecipientBase {
  type: 'ndfl';
  account: string;
  bank_code: string;
  name: string;
  inn: string;
  kpp: string;
  bank_correspondent_account: string;
  tax_fields: {
    kbk: string;
    oktmo: string;
    base: string;
    field107: string;
    type: string;
    status: string;
    document_number: string;
    document_date: string;
  };
  uin: string;
  purpose: string;
}

export type DealRecipient = 
  | RecipientPaymentContract 
  | RecipientSBP 
  | RecipientCard 
  | RecipientCommission 
  | RecipientNDFL;

export interface CreateDealParams {
  payers: DealPayer[];
  recipients: DealRecipient[];
}

export type DealStatus = 
  | 'new'
  | 'in_process'
  | 'correction'
  | 'closed'
  | 'cancelled';

export interface Deal {
  deal_id: string;
  status: DealStatus;
  payers: DealPayer[];
  recipients: DealRecipient[];
  created_at: string;
  updated_at: string;
}

// Payment Types
export type PaymentType =
  | 'incoming'
  | 'incoming_sbp'
  | 'incoming_unrecognized'
  | 'incoming_by_sbp_v2'
  | 'unrecognized_refund'
  | 'unrecognized_refund_sbp'
  | 'payment_contract'
  | 'payment_contract_by_sbp_v2'
  | 'payment_contract_to_card'
  | 'commission'
  | 'ndfl'
  | 'refund'
  | 'card';

export type PaymentStatus =
  | 'new'
  | 'in_process'
  | 'executed'
  | 'rejected'
  | 'returned';

// Basic Payment interface (for backward compatibility)
export interface Payment {
  payment_id: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  identified: boolean;
  created_at: string;
  purpose?: string;
}

// Extended Payment interface for v2 API
export interface PaymentDetail {
  payment_id: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  incoming: boolean;
  identify: boolean;
  created_at: string;
  updated_at?: string;

  // Document fields
  purpose?: string;
  document_number?: string;
  document_date?: string;

  // Payer fields
  payer_bank_code?: string;
  payer_account?: string;
  payer_name?: string;
  payer_tax_code?: string;
  payer_tax_reason_code?: string;
  payer_bank_name?: string;
  payer_correspondent_account?: string;

  // Recipient fields
  recipient_bank_code?: string;
  recipient_account?: string;
  recipient_name?: string;
  recipient_tax_code?: string;
  recipient_tax_reason_code?: string;
  recipient_bank_name?: string;
  recipient_correspondent_account?: string;

  // SBP specific fields
  cancel_reason_description?: string;

  // Card specific fields
  deal_id?: string;

  // Virtual accounts (after identification)
  virtual_accounts?: string[];

  // Allow additional unknown fields for fallback rendering
  [key: string]: unknown;
}

// Filters for list_payments_v2
export interface PaymentFilters {
  account?: string;
  bic?: string;
  status?: PaymentStatus | PaymentStatus[];
  type?: PaymentType | PaymentType[];
  create_date?: string;
  update_date?: string;
  updated_at_from?: string;
  updated_at_to?: string;
  incoming?: boolean;
  identify?: boolean;
  c2b_qr_code_id?: string;
}

// Parameters for list_payments_v2
export interface ListPaymentsV2Params {
  page?: number;
  per_page?: number;
  filters?: PaymentFilters;
}

// Result of list_payments_v2
export interface ListPaymentsV2Result {
  payments: PaymentDetail[];
  meta?: {
    total?: number;
    page?: {
      current_page?: number;
      per_page?: number;
    };
  };
}

// Result of get_payment
export interface GetPaymentResult {
  payment: PaymentDetail;
}

// Owner for identification
export interface PaymentOwner {
  virtual_account: string;
  amount: number;
}

// Parameters for identification_payment
export interface IdentifyPaymentParams {
  payment_id: string;
  is_returned_payment?: boolean;
  owners: PaymentOwner[];
}

// Result of identification_payment
export interface IdentifyPaymentResult {
  virtual_accounts: Array<{
    code: string;
    cash: number;
  }>;
}

// Unified API response format for payments
export interface PaymentApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code?: number | string;
    title: string;
    message: string;
    hint?: string;
    actions?: Array<{
      label: string;
      kind: 'retry' | 'link' | 'copy' | 'noop' | 'refresh';
      href?: string;
      payload?: unknown;
    }>;
  };
  meta?: {
    page?: number;
    total?: number;
    per_page?: number;
    current_page?: number;
  };
  cached?: boolean;
  cacheAgeSeconds?: number;
  nextAllowedAt?: string;
  requestId?: string;
}

// Auto-payment Rules
export interface AutoPaymentRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: 'balance_threshold' | 'schedule' | 'incoming_payment';
    threshold?: number;
    schedule?: string; // cron expression
  };
  action: {
    type: 'deal' | 'refund';
    template: Partial<CreateDealParams>;
  };
  created_at: string;
}
