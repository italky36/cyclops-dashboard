import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { 
  Layer, 
  JsonRpcRequest, 
  JsonRpcResponse,
  CyclopsConfig 
} from '@/types/cyclops';

const ENDPOINTS: Record<Layer, string> = {
  pre: 'https://pre.tochka.com/api/v1/cyclops/v2/jsonrpc',
  prod: 'https://api.tochka.com/api/v1/cyclops/v2/jsonrpc',
};

// Таймаут для API запросов (15 секунд)
const REQUEST_TIMEOUT = 15000;

export class CyclopsClient {
  private config: CyclopsConfig;
  private endpoint: string;

  constructor(config: CyclopsConfig) {
    this.config = config;
    this.endpoint = ENDPOINTS[config.layer];
  }

  /**
   * Создание подписи запроса согласно документации Cyclops (RSA OpenSSL)
   * 
   * Алгоритм:
   * 1. Берём полностью всё тело запроса
   * 2. Подписываем при помощи OpenSSL с sha256
   * 3. Конвертируем подпись в base64
   * 4. Удаляем переносы строк
   */
  private signRequest(body: string): string {
    // Подписываем тело запроса напрямую (как openssl dgst -sha256 -sign)
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(body, 'utf8');
    const signature = sign.sign(this.config.privateKey, 'base64');
    
    // Удаляем переносы строк (критично для HTTP заголовков)
    return signature.replace(/[\r\n]/g, '');
  }

  /**
   * Выполнение JSON-RPC запроса
   */
  async call<T = unknown>(
    method: string, 
    params: Record<string, unknown> = {}
  ): Promise<JsonRpcResponse<T>> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: uuidv4(),
    };

    const body = JSON.stringify(request);
    const signature = this.signRequest(body);

    if (process.env.NODE_ENV === 'development') {
      console.info('[Cyclops] request', {
        method,
        endpoint: this.endpoint,
        id: request.id,
        signSystem: this.config.signSystem,
        signThumbprint: this.config.signThumbprint,
        bodyBytes: Buffer.byteLength(body, 'utf8'),
        signatureBytes: Buffer.byteLength(signature, 'utf8'),
      });
    }

    // Создаём AbortController для таймаута
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'sign-data': signature,
          'sign-thumbprint': this.config.signThumbprint,
          'sign-system': this.config.signSystem,
        },
        body,
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Обработка ошибки таймаута
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(
          'Превышено время ожидания ответа от сервера (15 сек).\n' +
          'Возможные причины:\n' +
          '• Сервер Cyclops недоступен\n' +
          '• IP-адрес не в белом списке Tochka\n' +
          '• Проблемы с сетевым соединением'
        );
      }

      // Обработка сетевых ошибок
      if (fetchError instanceof Error) {
        throw new Error(`Ошибка сети: ${fetchError.message}`);
      }

      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (process.env.NODE_ENV === 'development') {
      console.info('[Cyclops] response', {
        method,
        status: response.status,
        statusText: response.statusText,
      });
    }

    if (!response.ok) {
      let responseText = '';
      try {
        responseText = await response.text();
      } catch {
        responseText = '';
      }

      // Формируем понятное сообщение об ошибке
      let errorMessage = '';
      switch (response.status) {
        case 403:
          errorMessage = 'Доступ запрещён (403). Возможные причины:\n' +
            '• Неверная подпись запроса (проверьте приватный ключ)\n' +
            '• Неверный sign-thumbprint или sign-system\n' +
            '• IP-адрес сервера не добавлен в белый список Tochka\n' +
            '• Срок действия сертификата истёк';
          break;
        case 401:
          errorMessage = 'Ошибка аутентификации (401). Проверьте настройки ключей в разделе Настройки.';
          break;
        case 400:
          errorMessage = `Неверный запрос (400): ${responseText || 'проверьте параметры'}`;
          break;
        case 500:
          errorMessage = 'Внутренняя ошибка сервера Cyclops (500). Попробуйте позже.';
          break;
        case 503:
          errorMessage = 'Сервер Cyclops недоступен (503). Попробуйте позже.';
          break;
        default:
          errorMessage = `HTTP ${response.status}: ${response.statusText}${responseText ? `: ${responseText}` : ''}`;
      }

      const error = new Error(errorMessage);
      (error as Error & { statusCode: number }).statusCode = response.status;
      throw error;
    }

    return response.json();
  }

  // ==================== БЕНЕФИЦИАРЫ ====================

  async createBeneficiaryUL(params: {
    inn: string;
    name: string;
    kpp: string;
  }) {
    return this.call('create_beneficiary_ul', params);
  }

  async createBeneficiaryIP(params: {
    inn: string;
    first_name: string;
    middle_name?: string;
    last_name: string;
    ogrnip?: string;
  }) {
    return this.call('create_beneficiary_ip', params);
  }

  async createBeneficiaryFL(params: {
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
  }) {
    return this.call('create_beneficiary_fl', params);
  }

  async getBeneficiary(beneficiary_id: string) {
    return this.call('get_beneficiary', { beneficiary_id });
  }

  async listBeneficiaries(filters?: { is_active?: boolean }) {
    return this.call('list_beneficiary', filters || {});
  }

  async activateBeneficiary(beneficiary_id: string) {
    return this.call('activate_beneficiary', { beneficiary_id });
  }

  async deactivateBeneficiary(beneficiary_id: string) {
    return this.call('deactivate_beneficiary', { beneficiary_id });
  }

  // ==================== ВИРТУАЛЬНЫЕ СЧЕТА ====================

  async createVirtualAccount(params: {
    beneficiary_id: string;
    type: 'standard' | 'for_ndfl';
  }) {
    return this.call('create_virtual_account', {
      beneficiary_id: params.beneficiary_id,
      virtual_account_type: params.type,
    });
  }

  async getVirtualAccount(virtual_account: string) {
    return this.call('get_virtual_account', { virtual_account });
  }

  async listVirtualAccounts(params?: {
    page?: number;
    per_page?: number;
    filters?: {
      beneficiary?: {
        id?: string;
        is_active?: boolean;
        legal_type?: 'F' | 'I' | 'J';
        inn?: string;
      };
    };
  }) {
    const requestParams: Record<string, unknown> = {
      page: params?.page ?? 1,
      per_page: params?.per_page ?? 100,
    };
    const beneficiary = params?.filters?.beneficiary;
    if (beneficiary && Object.keys(beneficiary).length > 0) {
      requestParams.filters = params?.filters;
    }
    return this.call('list_virtual_account', requestParams);
  }

  async listVirtualTransactions(params: {
    page?: number;
    per_page?: number;
    filters: {
      virtual_account?: string;
      deal_id?: string;
      payment_id?: string;
      created_date_from?: string;
      created_date_to?: string;
      incoming?: boolean;
      operation_type?: string;
      include_block_operations?: boolean;
    };
  }) {
    return this.call('list_virtual_transaction', {
      page: params.page ?? 1,
      per_page: params.per_page ?? 100,
      filters: params.filters,
    });
  }

  /**
   * Вывод средств с виртуального счёта (только для standard)
   * @param params.virtual_account - UUID виртуального счёта
   * @param params.recipient - реквизиты получателя
   * @param params.purpose - назначение платежа (до 210 символов)
   * @param params.ext_key - ключ идемпотентности (UUID)
   * @param params.identifier - идентификатор (1-60 символов)
   */
  async refundVirtualAccount(params: {
    virtual_account: string;
    recipient: {
      amount: number;
      account: string;
      bank_code: string;
      name: string;
      inn?: string;
      kpp?: string;
      document_number?: string;
    };
    purpose?: string;
    ext_key?: string;
    identifier?: string;
  }) {
    return this.call('refund_virtual_account', params);
  }

  /**
   * Перевод между виртуальными счетами (v1)
   * Работает только в рамках одного номинального счёта
   */
  async transferBetweenVirtualAccounts(params: {
    from_virtual_account: string;
    to_virtual_account: string;
    amount: number;
  }) {
    return this.call('transfer_between_virtual_accounts', params);
  }

  /**
   * Перевод между виртуальными счетами (v2)
   * С поддержкой статуса и идемпотентности
   */
  async transferBetweenVirtualAccountsV2(params: {
    from_virtual_account: string;
    to_virtual_account: string;
    amount: number;
    purpose?: string;
    ext_key?: string;
  }) {
    return this.call('transfer_between_virtual_accounts_v2', params);
  }

  /**
   * Получение статуса перевода между счетами
   */
  async getVirtualAccountsTransfer(transfer_id: string) {
    return this.call('get_virtual_accounts_transfer', { transfer_id });
  }

  // ==================== СДЕЛКИ ====================

  async createDeal(params: {
    payers: Array<{ virtual_account: string; amount: number }>;
    recipients: Array<Record<string, unknown>>;
  }) {
    return this.call('create_deal', params);
  }

  async updateDeal(params: {
    deal_id: string;
    recipients: Array<Record<string, unknown>>;
  }) {
    return this.call('update_deal', params);
  }

  async getDeal(deal_id: string) {
    return this.call('get_deal', { deal_id });
  }

  async listDeals(filters?: {
    status?: string[];
    date_from?: string;
    date_to?: string;
  }) {
    return this.call('list_deals', filters || {});
  }

  async executeDeal(deal_id: string) {
    return this.call('execute_deal', { deal_id });
  }

  async rejectDeal(deal_id: string) {
    return this.call('rejected_deal', { deal_id });
  }

  async cancelDealWithExecutedRecipients(deal_id: string) {
    return this.call('cancel_deal_with_executed_recipients', { deal_id });
  }

  // ==================== ПЛАТЕЖИ ====================

  async listPayments(filters?: {
    type?: string;
    identified?: boolean;
    date_from?: string;
    date_to?: string;
  }) {
    return this.call('list_payments_v2', filters || {});
  }

  async getPayment(payment_id: string) {
    return this.call('get_payment', { payment_id });
  }

  async identifyPayment(params: {
    payment_id: string;
    owners: Array<{ virtual_account: string; amount: number }>;
  }) {
    return this.call('identification_payment', params);
  }

  async refundPayment(params: {
    payment_id: string;
    amount?: number;
    virtual_accounts?: Array<{ virtual_account: string; amount: number }>;
  }) {
    return this.call('refund_payment', params);
  }

  // ==================== СБП ====================

  async listBanksSBP() {
    return this.call('list_bank_sbp', {});
  }

  async generateSBPQRCode(params: {
    amount: number;
    purpose: string;
  }) {
    return this.call('generate_sbp_qrcode', params);
  }

  // ==================== ДОКУМЕНТЫ ====================

  async uploadDocumentBeneficiary(params: {
    beneficiary_id: string;
    document_type: 'contract_offer';
    file_name: string;
    file_content: string; // base64
  }) {
    return this.call('upload_document', {
      entity_type: 'beneficiary',
      entity_id: params.beneficiary_id,
      document_type: params.document_type,
      file_name: params.file_name,
      file_content: params.file_content,
    });
  }

  async uploadDocumentDeal(params: {
    deal_id: string;
    recipient_number: number;
    document_type: 'service_agreement';
    file_name: string;
    file_content: string; // base64
  }) {
    return this.call('upload_document', {
      entity_type: 'deal',
      entity_id: params.deal_id,
      recipient_number: params.recipient_number,
      document_type: params.document_type,
      file_name: params.file_name,
      file_content: params.file_content,
    });
  }

  async getDocument(document_id: string) {
    return this.call('get_document', { document_id });
  }

  async listDocuments(filters?: { beneficiary_id?: string; deal_id?: string }) {
    return this.call('list_documents', filters || {});
  }

  // ==================== УТИЛИТЫ ====================

  async echo(text: string) {
    return this.call('echo', { text });
  }

  async generatePaymentOrder(payment_id: string) {
    return this.call('generate_payment_order', { payment_id });
  }
}

/**
 * Фабрика для создания клиента с конфигурацией из переменных окружения
 */
export function createCyclopsClient(layer: Layer): CyclopsClient {
  const envPrefix = layer === 'prod' ? 'CYCLOPS_PROD' : 'CYCLOPS_PRE';
  
  const privateKey = process.env[`${envPrefix}_PRIVATE_KEY`];
  const signSystem = process.env[`${envPrefix}_SIGN_SYSTEM`];
  const signThumbprint = process.env[`${envPrefix}_SIGN_THUMBPRINT`];

  if (!privateKey || !signSystem || !signThumbprint) {
    throw new Error(`Missing configuration for ${layer} layer`);
  }

  return new CyclopsClient({
    layer,
    privateKey,
    signSystem,
    signThumbprint,
  });
}
