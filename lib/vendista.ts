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
    const url = `${this.baseUrl}${path}`;

    console.info(`[Vendista] ${method} ${path}`, { params });

    try {
      const response = await axios({
        method,
        url,
        params: method === "GET" ? params : undefined,
        data: method === "POST" ? params : undefined,
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        timeout: 30000,
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
   */
  async fetchTransactions(params: {
    machine_id?: string | number;
    date_from?: string; // YYYY-MM-DD
    date_to?: string;   // YYYY-MM-DD
  }): Promise<VendistaTransaction[]> {
    const response = await this.request<unknown>("GET", "/transactions", params);
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
   */
  async fetchTransactionsForMachines(params: {
    machine_ids: (string | number)[];
    date_from: string;
    date_to: string;
  }): Promise<VendistaTransaction[]> {
    // Если API поддерживает batch-запрос - используем его
    // Иначе делаем последовательные запросы
    const allTransactions: VendistaTransaction[] = [];

    for (const machine_id of params.machine_ids) {
      const transactions = await this.fetchTransactions({
        machine_id,
        date_from: params.date_from,
        date_to: params.date_to,
      });
      allTransactions.push(...transactions);
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
