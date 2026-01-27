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
  };
}

// Beneficiary Types
export type BeneficiaryType = 'ul' | 'ip' | 'fl';

export interface BeneficiaryUL {
  type: 'ul';
  inn: string;
  name: string;
  kpp: string;
}

export interface BeneficiaryIP {
  type: 'ip';
  inn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ogrnip?: string;
}

export interface BeneficiaryFL {
  type: 'fl';
  inn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  birth_date: string;
  birth_place: string;
  passport_series: string;
  passport_number: string;
  passport_date: string;
  registration_address: string;
}

export type Beneficiary = BeneficiaryUL | BeneficiaryIP | BeneficiaryFL;

export interface BeneficiaryResponse {
  beneficiary_id: string;
  is_active: boolean;
  is_added_to_ms: boolean;
  created_at: string;
}

// Virtual Account Types
export type VirtualAccountType = 'standard' | 'for_ndfl';

export interface VirtualAccount {
  virtual_account_id: string;
  beneficiary_id: string;
  type: VirtualAccountType;
  available_amount: number;
  blocked_amount: number;
  is_active: boolean;
}

export interface CreateVirtualAccountParams {
  beneficiary_id: string;
  type: VirtualAccountType;
}

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
  | 'payment_contract'
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

export interface Payment {
  payment_id: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  identified: boolean;
  created_at: string;
  purpose?: string;
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
