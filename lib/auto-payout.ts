import { v4 as uuidv4 } from 'uuid';
import {
  getClientById,
  getMachinesByClient,
  calculateClientPayoutUnified,
  createClientPayout,
  buildDealParamsForClient,
  getPlatformSettings,
  computeNextPayoutDate,
  updateClient,
} from './clients';
import { updatePayoutStatus, logAction } from './vending';
import { createVendistaClient, isVendistaConfigured } from './vendista';
import { getCyclopsClient } from './cyclops-helpers';
import { getClientDocumentBase64 } from './documents';
import type { Layer } from '@/types/cyclops';

export interface AutoPayoutResult {
  client_id: number;
  client_name: string;
  success: boolean;
  payout_id?: number;
  deal_id?: string;
  amount?: number;
  error?: string;
  skipped_reason?: string;
}

/**
 * Выполняет автоматическую выплату для одного клиента:
 * 1. Получает транзакции из Vendista
 * 2. Рассчитывает сумму с учётом комиссии клиента
 * 3. Создаёт сделку в Cyclops
 * 4. Загружает документ в сделку (обязательно)
 * 5. Исполняет сделку
 * 6. Двигает next_payout_at на следующий цикл
 */
export async function executeAutoPayoutForClient(
  clientId: number,
  layer: Layer
): Promise<AutoPayoutResult> {
  const client = getClientById(clientId);
  if (!client) {
    return { client_id: clientId, client_name: '?', success: false, error: 'Клиент не найден' };
  }

  const result: AutoPayoutResult = { client_id: clientId, client_name: client.name, success: false };

  try {
    // 1. Проверяем предварительные условия
    const settings = getPlatformSettings();
    if (!settings.payout_virtual_account) {
      return { ...result, error: 'Не настроен виртуальный счёт платформы' };
    }
    if (client.commission_percent === null || client.commission_percent === undefined) {
      return { ...result, error: 'Не задана комиссия клиента' };
    }
    if (!client.document_filename) {
      return { ...result, error: 'Не загружен документ (договор)' };
    }

    // 2. Проверяем наличие машин
    const machines = getMachinesByClient(clientId);
    if (machines.length === 0) {
      return { ...result, skipped_reason: 'Нет привязанных автоматов', success: true };
    }

    // 3. Вычисляем дату окончания периода (сегодня минус exclude_days)
    const today = new Date();
    today.setDate(today.getDate() - (client.payout_exclude_days || 0));
    const endDate = today.toISOString().split('T')[0];

    // 4. Получаем транзакции из Vendista
    let transactions: Array<{ id: string | number; machine_id: string | number; date: string; amount: number }> = [];

    if (isVendistaConfigured()) {
      const vendistaClient = createVendistaClient();
      const terminalIds = machines
        .map(m => m.terminal_id)
        .filter((t): t is string => t !== null && t !== undefined);

      if (terminalIds.length > 0) {
        const startDate = machines.reduce((earliest, m) => {
          const d = m.assigned_at.split('T')[0];
          return d < earliest ? d : earliest;
        }, endDate);

        transactions = await vendistaClient.fetchTransactionsForMachines({
          terminal_ids: terminalIds,
          startDate,
          endDate,
        });
      }
    }

    // 5. Рассчитываем выплату с единой комиссией клиента
    const calculation = calculateClientPayoutUnified(clientId, transactions, endDate);

    if (calculation.payout_amount <= 0) {
      // Нулевая сумма — двигаем next_payout_at, не создаём сделку
      if (client.payout_frequency) {
        updateClient(clientId, {
          next_payout_at: computeNextPayoutDate(client.payout_frequency, new Date().toISOString().split('T')[0]),
        });
      }
      return { ...result, skipped_reason: 'Сумма к выплате = 0', success: true };
    }

    // 6. Создаём локальную запись о выплате
    const payout = createClientPayout(calculation, 'auto');
    updatePayoutStatus(payout.id, 'processing');
    result.payout_id = payout.id;

    // 7. Формируем параметры сделки
    const period = `${calculation.period_start} — ${calculation.period_end}`;
    const purpose = settings.payout_purpose_template.replace('{period}', period);
    const extKey = `auto_payout_${payout.id}_${uuidv4().slice(0, 8)}`;

    const dealParams = buildDealParamsForClient(
      client,
      settings.payout_virtual_account,
      calculation.payout_amount,
      purpose,
      extKey
    );

    // 8. Создаём сделку в Cyclops
    const cyclopsClient = await getCyclopsClient(layer);
    const createRes = await cyclopsClient.call<{ deal_id: string }>('create_deal', dealParams);

    if (createRes.error) {
      updatePayoutStatus(
        payout.id, 'failed', undefined,
        JSON.stringify(createRes.error),
        `create_deal: ${createRes.error.message}`
      );
      return { ...result, error: `create_deal: ${createRes.error.message}` };
    }

    const dealId = (createRes.result as { deal_id: string }).deal_id;
    result.deal_id = dealId;

    // 9. Загружаем документ в сделку (ОБЯЗАТЕЛЬНО)
    const docBase64 = getClientDocumentBase64(clientId, client.document_filename);
    if (!docBase64) {
      updatePayoutStatus(
        payout.id, 'failed', dealId, undefined,
        'Документ не найден на диске при загрузке в сделку'
      );
      return { ...result, error: 'Документ не найден на диске' };
    }

    const docUploadRes = await cyclopsClient.uploadDocumentDeal({
      deal_id: dealId,
      recipient_number: 1,
      document_type: 'service_agreement',
      file_name: client.document_filename,
      file_content: docBase64,
    });

    if (docUploadRes.error) {
      updatePayoutStatus(
        payout.id, 'failed', dealId,
        JSON.stringify(docUploadRes.error),
        `upload_document: ${docUploadRes.error.message}`
      );
      return { ...result, error: `upload_document: ${docUploadRes.error.message}` };
    }

    // 10. Исполняем сделку
    const execRes = await cyclopsClient.call('execute_deal', { deal_id: dealId });

    if (execRes.error) {
      updatePayoutStatus(
        payout.id, 'failed', dealId,
        JSON.stringify(execRes.error),
        `execute_deal: ${execRes.error.message}`
      );
      return { ...result, error: `execute_deal: ${execRes.error.message}` };
    }

    // 11. Успех — обновляем статус
    updatePayoutStatus(
      payout.id, 'completed', dealId,
      JSON.stringify({ create: createRes.result, doc_upload: docUploadRes.result, execute: execRes.result })
    );
    result.success = true;
    result.amount = calculation.payout_amount;

    // 12. Двигаем next_payout_at на следующий цикл
    if (client.payout_frequency) {
      const nextDate = computeNextPayoutDate(
        client.payout_frequency,
        new Date().toISOString().split('T')[0]
      );
      updateClient(clientId, { next_payout_at: nextDate });
    }

    logAction('auto_payout_success', 'beneficiary_payout', String(payout.id), JSON.stringify({
      client_id: clientId,
      deal_id: dealId,
      amount: calculation.payout_amount,
    }));

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
    if (result.payout_id) {
      updatePayoutStatus(result.payout_id, 'failed', result.deal_id, undefined, msg);
    }
    logAction('auto_payout_error', 'client', String(clientId), JSON.stringify({ error: msg }));
    return { ...result, error: msg };
  }
}
