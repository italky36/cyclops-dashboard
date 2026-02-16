import { v4 as uuidv4 } from 'uuid';
import {
  getClientById,
  getMachinesByClient,
  calculateClientPayoutUnified,
  createClientPayout,
  buildDealParamsForClient,
  resolveClientPayoutPurpose,
  getPlatformSettings,
  computeNextPayoutDate,
  updateClient,
} from './clients';
import { updatePayoutStatus, logAction } from './vending';
import { createVendistaClient, isVendistaConfigured } from './vendista';
import { getCyclopsClient } from './cyclops-helpers';
import { readClientDocument } from './documents';
import { resolveDocumentMimeType, isAllowedDealDocumentMimeType } from './cyclops-document-utils';
import { uploadDealDocumentBinary } from './cyclops-deal-document-upload';
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

type VirtualAccountMatch = { id: string } | { id: null; reason: 'none' | 'multiple' };

const resolveVirtualAccountForBeneficiary = async (
  cyclopsClient: Awaited<ReturnType<typeof getCyclopsClient>>,
  beneficiaryId: string
): Promise<VirtualAccountMatch> => {
  const listResult = await cyclopsClient.call('list_virtual_account', { page: 1, per_page: 1000 });
  if (listResult.error) {
    return { id: null, reason: 'none' };
  }

  const list = (listResult.result as { virtual_accounts?: unknown[] } | undefined)?.virtual_accounts;
  if (!Array.isArray(list) || list.length === 0) {
    return { id: null, reason: 'none' };
  }

  const details = await Promise.all(
    list.map(async (accountId) => {
      if (typeof accountId !== 'string') return null;
      const detailResult = await cyclopsClient.call('get_virtual_account', { virtual_account: accountId });
      if (detailResult.error) return null;
      const detail = (detailResult.result as { virtual_account?: { beneficiary_id?: string; type?: string } } | undefined)
        ?.virtual_account;
      if (!detail?.beneficiary_id) return null;
      return {
        id: accountId,
        beneficiary_id: detail.beneficiary_id,
        type: detail.type,
      };
    })
  );

  const matches = details.filter((item) =>
    item && item.beneficiary_id === beneficiaryId && (!item.type || item.type === 'standard')
  ) as Array<{ id: string }>;

  if (matches.length === 1) return { id: matches[0].id };
  if (matches.length === 0) return { id: null, reason: 'none' };
  return { id: null, reason: 'multiple' };
};

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
    if (client.payout_type === 'none') {
      return { ...result, error: 'Шаблон выплаты не задан' };
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
    const endDate = today.toISOString();

    // 4. Получаем транзакции из Vendista
    let transactions: Array<{ id: string | number; machine_id: string | number; date: string; amount: number }> = [];

    if (isVendistaConfigured()) {
      const vendistaClient = createVendistaClient();
      const terminalIds = machines
        .map(m => m.terminal_id)
        .filter((t) => t !== null && t !== undefined);
      const machineIds = machines
        .filter(m => !m.terminal_id)
        .map(m => m.vendista_id)
        .filter((t) => t !== null && t !== undefined);

      if (terminalIds.length > 0 || machineIds.length > 0) {
        const startDate = machines.reduce((earliest, m) => {
          const d = m.assigned_at;
          return d < earliest ? d : earliest;
        }, endDate);

        transactions = await vendistaClient.fetchTransactionsForMachines({
          machine_ids: machineIds,
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
    const purpose = resolveClientPayoutPurpose(client, period, settings.payout_purpose_template);
    const extKey = `auto_payout_${payout.id}_${uuidv4().slice(0, 8)}`;

    // 8. Создаём сделку в Cyclops
    const cyclopsClient = await getCyclopsClient(layer);

    const beneficiaryIds = new Set(
      machines.map((m) => m.beneficiary_id).filter((id): id is string => Boolean(id))
    );
    let beneficiaryId: string | null = null;
    if (beneficiaryIds.size === 1) {
      beneficiaryId = Array.from(beneficiaryIds)[0];
    } else if (beneficiaryIds.size === 0 && client.beneficiary_id) {
      beneficiaryId = client.beneficiary_id;
    }

    let payerVirtualAccount: string | null = null;
    if (client.payout_virtual_account) {
      payerVirtualAccount = client.payout_virtual_account;
    }
    if (!payerVirtualAccount && beneficiaryId) {
      const resolved = await resolveVirtualAccountForBeneficiary(cyclopsClient, beneficiaryId);
      if (resolved.id) {
        payerVirtualAccount = resolved.id;
      } else if ('reason' in resolved && resolved.reason === 'multiple') {
        return { ...result, error: 'У бенефициара несколько виртуальных счетов. Нужен выбор плательщика.' };
      }
    }

    if (!payerVirtualAccount && settings.payout_virtual_account) {
      payerVirtualAccount = settings.payout_virtual_account;
    }

    if (!payerVirtualAccount) {
      return { ...result, error: 'Не удалось определить виртуальный счёт плательщика для выплаты.' };
    }

    const dealParams = buildDealParamsForClient(
      client,
      payerVirtualAccount,
      calculation.payout_amount,
      purpose,
      extKey
    );

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
    const docBuffer = readClientDocument(clientId, client.document_filename);
    if (!docBuffer) {
      updatePayoutStatus(
        payout.id, 'failed', dealId, undefined,
        'Документ не найден на диске при загрузке в сделку'
      );
      return { ...result, error: 'Документ не найден на диске' };
    }

    let docBeneficiaryId: string | null = null;
    if (beneficiaryId) {
      docBeneficiaryId = beneficiaryId;
    } else if (client.beneficiary_id) {
      docBeneficiaryId = client.beneficiary_id;
    } else if (payerVirtualAccount) {
      const vaRes = await cyclopsClient.call('get_virtual_account', { virtual_account: payerVirtualAccount });
      const vaBeneficiary = (vaRes.result as { virtual_account?: { beneficiary_id?: string } } | undefined)
        ?.virtual_account?.beneficiary_id;
      if (vaBeneficiary) docBeneficiaryId = vaBeneficiary;
    }

    if (!docBeneficiaryId) {
      updatePayoutStatus(
        payout.id, 'failed', dealId, undefined,
        'Ошибка загрузки документа: beneficiary_id не найден'
      );
      return { ...result, error: 'Ошибка загрузки документа: beneficiary_id не найден' };
    }

    const fallbackMime = resolveDocumentMimeType({ name: client.document_filename, type: '' });
    const contentType = client.document_mime_type || fallbackMime;
    if (!contentType || !isAllowedDealDocumentMimeType(contentType)) {
      updatePayoutStatus(
        payout.id, 'failed', dealId, undefined,
        'Ошибка загрузки документа: неподдерживаемый формат'
      );
      return { ...result, error: 'Ошибка загрузки документа: неподдерживаемый формат' };
    }

    const docDate = (client.document_uploaded_at || new Date().toISOString()).split('T')[0];
    const docNumber = String(payout.id);
    const docUploadRes = await uploadDealDocumentBinary({
      layer,
      beneficiary_id: docBeneficiaryId,
      deal_id: dealId,
      document_type: 'service_agreement',
      document_date: docDate,
      document_number: docNumber,
      contentType,
      body: docBuffer,
    });

    if (!docUploadRes.ok) {
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
      JSON.stringify({ create: createRes.result, doc_upload: docUploadRes.ok ? docUploadRes.data : null, execute: execRes.result })
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
