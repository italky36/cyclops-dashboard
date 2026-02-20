import axios from "axios";
import { z } from "zod";

// ============ СХЕМЫ ВАЛИДАЦИИ ============

const vendistaMachineSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  model_id: z.number().optional().nullable(),
  address: z.string().optional().nullable(),
  number: z.union([z.string(), z.number()]).optional().nullable(), // серийный номер
  terminal_id: z.union([z.number(), z.string()]).optional().nullable(),
  state_id: z.number().optional().nullable(), // 1 = активен
});

const vendistaMachinesResponseSchema = z.object({
  items: z.array(vendistaMachineSchema).default([]),
});

const vendistaTransactionSchema = z.object({
  id: z.union([z.number(), z.string()]),
  machine_id: z.union([z.number(), z.string()]),
  date: z.string(), // ISO datetime
  amount: z.number(),
  type: z.string().optional().nullable(), // cash, card, etc.
  product_name: z.string().optional().nullable(),
  product_id: z.union([z.number(), z.string()]).optional().nullable(),
});


export type VendistaMachine = z.infer<typeof vendistaMachineSchema>;
export type VendistaTransaction = z.infer<typeof vendistaTransactionSchema>;

const SALES_DATE_KEYS = [
  'time', // Vendista использует 'time' для транзакций
  'date',
  'Date',
  'sale_date',
  'saleDate',
  'created_at',
  'createdAt',
  'timestamp',
  'DateTime',
  'Time',
  'datetime',
  'date_time',
];
const SALES_AMOUNT_KEYS = ['amount', 'Amount', 'sum', 'Sum', 'total', 'Total', 'price', 'Price', 'value', 'Value'];
// ВАЖНО: term_id идёт ПЕРВЫМ - это числовой ID терминала для сопоставления с БД
// terminal_id - это строковый ID устройства типа 'VP276144', он НЕ подходит
const SALES_MACHINE_KEYS = ['term_id', 'TermId', 'machine_id', 'machineId', 'MachineId', 'machineID'];
const SALES_ID_KEYS = ['id', 'Id', 'sale_id', 'saleId', 'SaleId'];
const SALES_PRICE_KEYS = ['price', 'Price', 'cost', 'Cost', 'item_price', 'ItemPrice', 'itemPrice'];
const SALES_QTY_KEYS = ['qty', 'Qty', 'quantity', 'Quantity', 'count', 'Count'];

const getFirstValue = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return undefined;
};

const normalizeSaleItem = (item: Record<string, unknown>): VendistaTransaction | null => {
  const machineRaw = getFirstValue(item, SALES_MACHINE_KEYS);
  const dateValue = getFirstValue(item, SALES_DATE_KEYS);
  let amountValue = getFirstValue(item, SALES_AMOUNT_KEYS);

  if (amountValue === undefined || amountValue === null) {
    const priceValue = getFirstValue(item, SALES_PRICE_KEYS);
    const qtyValue = getFirstValue(item, SALES_QTY_KEYS);
    if (priceValue !== undefined && qtyValue !== undefined) {
      const priceNum = Number(priceValue);
      const qtyNum = Number(qtyValue);
      if (!Number.isNaN(priceNum) && !Number.isNaN(qtyNum)) {
        amountValue = priceNum * qtyNum;
      }
    } else if (priceValue !== undefined) {
      const priceNum = Number(priceValue);
      if (!Number.isNaN(priceNum)) {
        amountValue = priceNum;
      }
    }
  }

  if (machineRaw === undefined || dateValue === undefined || amountValue === undefined || amountValue === null) {
    return null;
  }

  const amountNum = Number(amountValue);
  if (Number.isNaN(amountNum)) {
    return null;
  }

  const dateStr = String(dateValue);
  const parsedDate = new Date(dateStr);
  const normalizedDate = Number.isNaN(parsedDate.getTime()) ? dateStr : parsedDate.toISOString();
  const idValue = getFirstValue(item, SALES_ID_KEYS);

  let machineId: string | number;
  if (typeof machineRaw === 'string' || typeof machineRaw === 'number') {
    machineId = machineRaw;
  } else {
    machineId = String(machineRaw);
  }

  let normalizedId: string | number;
  if (typeof idValue === 'string' || typeof idValue === 'number') {
    normalizedId = idValue;
  } else if (idValue !== undefined && idValue !== null) {
    normalizedId = String(idValue);
  } else {
    normalizedId = `${machineId}_${dateStr}`;
  }

  // Vendista API всегда возвращает суммы в копейках — конвертируем в рубли
  const amountRub = Math.round(amountNum) / 100;

  return {
    id: normalizedId,
    machine_id: machineId,
    date: normalizedDate,
    amount: amountRub,
  };
};

// ============ КОНФИГУРАЦИЯ ============

export function getVendistaBaseUrl(): string {
  return process.env.VENDISTA_BASE_URL?.trim() || "https://api.vendista.ru:99";
}

export function getVendistaToken(): string {
  return process.env.VENDISTA_API_KEY?.trim() || "";
}

export function isVendistaConfigured(): boolean {
  return !!getVendistaToken();
}

// ============ КЛИЕНТ API ============

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class VendistaClient {
  private baseUrl: string;
  private token: string;
  private requestDelay = 300; // задержка между запросами (мс)
  private maxRetries = 4; // макс. кол-во повторов при 429
  private lastRequestTime = 0;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || getVendistaBaseUrl();
    this.token = token || getVendistaToken();

    if (!this.token) {
      throw new Error("Vendista API key is not configured");
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    // Vendista требует токен как query параметр
    url.searchParams.set("token", this.token);

    // Добавляем остальные параметры в URL для GET запросов
    if (method === "GET" && params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    // Задержка между запросами для избежания 429
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.requestDelay) {
      await delay(this.requestDelay - elapsed);
    }

    console.info(`[Vendista] ${method} ${url.pathname}`, { params });

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.lastRequestTime = Date.now();
        const response = await axios({
          method,
          url: url.toString(),
          data: method === "POST" ? params : undefined,
          headers: {
            "Accept": "text/plain",
          },
          timeout: 60000,
          // Vendista может возвращать text/plain с JSON внутри
          transformResponse: (data) => {
            if (typeof data === "string") {
              try {
                return JSON.parse(data);
              } catch {
                return data;
              }
            }
            return data;
          },
        });

        console.info(`[Vendista] Response status: ${response.status}`);

        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          // Retry при 429 с экспоненциальной задержкой
          if (status === 429 && attempt < this.maxRetries) {
            const backoff = this.requestDelay * Math.pow(2, attempt + 1); // 600, 1200, 2400, 4800
            console.warn(`[Vendista] 429 rate limited, retry ${attempt + 1}/${this.maxRetries} after ${backoff}ms`);
            await delay(backoff);
            continue;
          }

          const data = error.response?.data;
          console.error(`[Vendista] Error: ${status}`, data);
          throw new Error(`Vendista API error: ${status} - ${JSON.stringify(data)}`);
        }
        throw error;
      }
    }

    throw new Error('Vendista API: max retries exceeded');
  }

  /**
   * Получение списка всех торговых автоматов
   */
  async fetchMachines(): Promise<VendistaMachine[]> {
    const response = await this.request<unknown>("GET", "/machines");

    console.log('[Vendista] fetchMachines raw response (first 3):',
      Array.isArray(response)
        ? (response as unknown[]).slice(0, 3)
        : (response as { items?: unknown[] })?.items?.slice(0, 3)
    );

    const parsed = vendistaMachinesResponseSchema.safeParse(response);

    if (!parsed.success) {
      console.error("[Vendista] Failed to parse machines response:", parsed.error);
      // Попытка парсить как массив напрямую
      const arrayParsed = z.array(vendistaMachineSchema).safeParse(response);
      if (arrayParsed.success) {
        return arrayParsed.data;
      }
      throw new Error("Invalid machines response format");
    }

    return parsed.data.items;
  }

  /**
   * Получение транзакций (продаж) по автомату за период
   * @param params.term_id - terminal_id автомата из Vendista (обязательно)
   * @param params.startDate - начало периода в формате YYYY-MM-DD
   * @param params.endDate - конец периода в формате YYYY-MM-DD
   */
  async fetchTransactions(params: {
    term_id: string | number;
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
  }): Promise<VendistaTransaction[]> {
    // Vendista API использует параметры: TermId, DateFrom, DateTo, PageNumber, ItemsOnPage
    const requestParams: Record<string, unknown> = {
      TermId: String(params.term_id),
    };

    if (params.startDate) {
      requestParams.DateFrom = params.startDate;
    }
    if (params.endDate) {
      requestParams.DateTo = params.endDate;
    }

    console.log('[Vendista] fetchTransactions request:', { params, requestParams });

    // Получаем все страницы с пагинацией
    const allItems: unknown[] = [];
    let pageNumber = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const pageParams = { ...requestParams, PageNumber: pageNumber };
      const response = await this.request<unknown>("GET", "/transactions", pageParams);

      console.log(`[Vendista] fetchTransactions page ${pageNumber} response type:`, typeof response);

      const responseObj = response as {
        items?: unknown[];
        data?: unknown[];
        result?: unknown[];
        items_count?: number;
        items_per_page?: number;
        page_number?: number;
      };

      const items = Array.isArray(response)
        ? response
        : responseObj.items ?? responseObj.data ?? responseObj.result ?? [];

      if (!Array.isArray(items)) {
        console.warn(`[Vendista] fetchTransactions page ${pageNumber} items is not an array`);
        break;
      }

      allItems.push(...items);
      console.log(`[Vendista] fetchTransactions page ${pageNumber}: got ${items.length} items, total: ${allItems.length}`);

      // Проверяем пагинацию
      const itemsCount = responseObj.items_count;
      const itemsPerPage = responseObj.items_per_page || 50;

      if (itemsCount && allItems.length < itemsCount) {
        pageNumber++;
        hasMorePages = true;
      } else if (items.length === itemsPerPage) {
        // Если получили полную страницу, возможно есть ещё данные
        pageNumber++;
        hasMorePages = true;
      } else {
        hasMorePages = false;
      }

      // Защита от бесконечного цикла
      if (pageNumber > 100) {
        console.warn('[Vendista] fetchTransactions: reached max page limit (100)');
        break;
      }
    }

    console.log('[Vendista] fetchTransactions total items fetched:', allItems.length);
    if (allItems.length > 0) {
      console.log('[Vendista] fetchTransactions first item:', allItems[0]);
    }

    // Фильтруем возвраты (reverse_id != 0) и неуспешные транзакции (result != 1, status != 1)
    const validItems = allItems.filter((item) => {
      const obj = item as Record<string, unknown>;
      const reverseId = Number(obj.reverse_id ?? 0);
      const result = obj.result !== undefined ? Number(obj.result) : 1;
      const status = obj.status !== undefined ? Number(obj.status) : 1;
      return reverseId === 0 && result === 1 && status === 1;
    });

    console.log('[Vendista] fetchTransactions after filtering:', {
      before: allItems.length,
      after: validItems.length,
      filtered_out: allItems.length - validItems.length,
    });

    const normalized = validItems
      .map((item) => normalizeSaleItem(item as Record<string, unknown>))
      .filter((item): item is VendistaTransaction => !!item);

    console.log('[Vendista] fetchTransactions normalized count:', normalized.length);
    if (normalized.length > 0) {
      console.log('[Vendista] fetchTransactions first normalized:', normalized[0]);
    }

    return normalized;
  }

  /**
   * Получение транзакций по нескольким автоматам за период
   * @param params.terminal_ids - массив terminal_id автоматов
   */
  async fetchTransactionsForMachines(params: {
    terminal_ids: (string | number)[];
    startDate: string;
    endDate: string;
  }): Promise<VendistaTransaction[]> {
    const terminalIds = params.terminal_ids.filter((id) => id !== null && id !== undefined);

    const allTransactions: VendistaTransaction[] = [];

    for (const term_id of terminalIds) {
      try {
        const transactions = await this.fetchTransactions({
          term_id,
          startDate: params.startDate,
          endDate: params.endDate,
        });
        console.log(`[Vendista] Terminal ${term_id}: got ${transactions.length} transactions, machine_ids: ${Array.from(new Set(transactions.map(t => t.machine_id))).join(',')}`);
        allTransactions.push(...transactions);
      } catch (error) {
        console.error(`[Vendista] FAILED to fetch for terminal ${term_id}:`, error);
      }
    }

    return allTransactions;
  }

  /**
   * Проверка соединения с API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchMachines();
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Создание клиента Vendista
 */
export function createVendistaClient(): VendistaClient {
  return new VendistaClient();
}
