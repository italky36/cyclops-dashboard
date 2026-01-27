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

const vendistaTransactionsResponseSchema = z.object({
  items: z.array(vendistaTransactionSchema).default([]),
});

export type VendistaMachine = z.infer<typeof vendistaMachineSchema>;
export type VendistaTransaction = z.infer<typeof vendistaTransactionSchema>;

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

export class VendistaClient {
  private baseUrl: string;
  private token: string;

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

    console.info(`[Vendista] ${method} ${url.pathname}`, { params });

    try {
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
        const data = error.response?.data;
        console.error(`[Vendista] Error: ${status}`, data);
        throw new Error(`Vendista API error: ${status} - ${JSON.stringify(data)}`);
      }
      throw error;
    }
  }

  /**
   * Получение списка всех торговых автоматов
   */
  async fetchMachines(): Promise<VendistaMachine[]> {
    const response = await this.request<unknown>("GET", "/machines");
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
    // Vendista API использует параметры: TermId, startDate, endDate
    const requestParams: Record<string, unknown> = {
      TermId: String(params.term_id),
    };

    if (params.startDate) {
      requestParams.startDate = params.startDate;
    }
    if (params.endDate) {
      requestParams.endDate = params.endDate;
    }

    const response = await this.request<unknown>("GET", "/transactions", requestParams);
    const parsed = vendistaTransactionsResponseSchema.safeParse(response);

    if (!parsed.success) {
      console.error("[Vendista] Failed to parse transactions response:", parsed.error);
      // Попытка парсить как массив напрямую
      const arrayParsed = z.array(vendistaTransactionSchema).safeParse(response);
      if (arrayParsed.success) {
        return arrayParsed.data;
      }
      throw new Error("Invalid transactions response format");
    }

    return parsed.data.items;
  }

  /**
   * Получение продаж по нескольким автоматам за период
   * @param params.terminal_ids - массив terminal_id автоматов
   */
  async fetchTransactionsForMachines(params: {
    terminal_ids: (string | number)[];
    startDate: string;
    endDate: string;
  }): Promise<VendistaTransaction[]> {
    // Vendista API не поддерживает batch-запросы
    // Делаем последовательные запросы для каждого автомата
    const allTransactions: VendistaTransaction[] = [];

    for (const term_id of params.terminal_ids) {
      try {
        const transactions = await this.fetchTransactions({
          term_id,
          startDate: params.startDate,
          endDate: params.endDate,
        });
        allTransactions.push(...transactions);
      } catch (error) {
        console.error(`[Vendista] Failed to fetch transactions for terminal ${term_id}:`, error);
        // Продолжаем для остальных автоматов
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
