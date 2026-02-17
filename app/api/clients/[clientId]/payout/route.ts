import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createVendistaClient, isVendistaConfigured } from '@/lib/vendista';
import {
  getClientById,
  getMachinesByClient,
  calculateClientPayoutUnified,
  createClientPayout,
  buildDealParamsForClient,
  getPlatformSettings,
  resolveClientPayoutPurpose,
} from '@/lib/clients';
import { updatePayoutStatus } from '@/lib/vending';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';
import { readClientDocument } from '@/lib/documents';
import { resolveDocumentMimeType, isAllowedDealDocumentMimeType } from '@/lib/cyclops-document-utils';
import { uploadDealDocumentBinary } from '@/lib/cyclops-deal-document-upload';
import { parseClientIdParam } from '@/lib/client-slug';

const normalizeDateTime = (value?: string, endOfDay = false): string => {
  if (!value) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`).toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
};

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

// POST /api/clients/[clientId]/payout — расчёт или выполнение выплаты
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseClientIdParam(clientId);
    if (!id) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const body = await request.json();
    const { action, end_date, start_date, user_id, virtual_account } = body;

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    // Получаем машины клиента
    const machines = getMachinesByClient(id);
    console.log('[Payout API] Machines from DB:', machines.map(m => ({
      id: m.id,
      vendista_id: m.vendista_id,
      terminal_id: m.terminal_id,
      name: m.name,
    })));
    if (machines.length === 0) {
      const periodEnd = normalizeDateTime(end_date, true);
      const periodStart = start_date ? normalizeDateTime(start_date, false) : periodEnd;
      return NextResponse.json({
        calculation: {
          client_id: id,
          client_name: client.name,
          period_start: periodStart,
          period_end: periodEnd,
          machines: [],
          total_sales: 0,
          total_commission: 0,
          payout_amount: 0,
        },
        message: 'У клиента нет привязанных автоматов',
      });
    }

    // Получаем транзакции из Vendista
    let transactions: Array<{ id: string | number; machine_id: string | number; date: string; amount: number }> = [];
    let debugInfo: Record<string, unknown> = {};

    if (isVendistaConfigured()) {
      const vendistaClient = createVendistaClient();
      const terminal_ids = machines
        .map(m => m.terminal_id)
        .filter((id) => id !== null && id !== undefined);

      const machine_ids = machines
        .filter(m => !m.terminal_id)
        .map(m => m.vendista_id)
        .filter((mid) => mid !== null && mid !== undefined);

      console.log('[Payout API] Filtered IDs:', {
        terminal_ids_count: terminal_ids.length,
        terminal_ids,
        machine_ids_count: machine_ids.length,
        machine_ids,
      });

      const endDate = normalizeDateTime(end_date, true);
      const startDate = start_date
        ? normalizeDateTime(start_date, false)
        : machines.reduce((earliest, m) => {
          const assignedDate = normalizeDateTime(m.assigned_at);
          return assignedDate < earliest ? assignedDate : earliest;
        }, endDate);

      console.log('[Payout API] Fetching Vendista transactions:', {
        client_id: id,
        client_name: client.name,
        terminal_ids,
        machine_ids,
        startDate,
        endDate,
        machines_count: machines.length,
      });

      debugInfo = {
        terminal_ids,
        machine_ids,
        startDate,
        endDate,
        machines_count: machines.length,
      };

      if (terminal_ids.length > 0 || machine_ids.length > 0) {
        transactions = await vendistaClient.fetchTransactionsForMachines({
          machine_ids,
          terminal_ids,
          startDate,
          endDate,
        });

        console.log('[Payout API] Vendista transactions received:', {
          count: transactions.length,
          sample: transactions.slice(0, 3),
          total_amount: transactions.reduce((sum, t) => sum + t.amount, 0),
        });

        debugInfo = {
          ...debugInfo,
          transactions_count: transactions.length,
          transactions_sample: transactions.slice(0, 5),
          total_amount: transactions.reduce((sum, t) => sum + t.amount, 0),
        };
      } else {
        console.log('[Payout API] No terminal_ids or machine_ids found');
      }
    } else {
      console.log('[Payout API] Vendista not configured');
      debugInfo = { vendista_configured: false };
    }

    const calculation = calculateClientPayoutUnified(
      id,
      transactions,
      normalizeDateTime(end_date, true),
      start_date ? normalizeDateTime(start_date, false) : undefined
    );

    // Только расчёт (preview)
    if (action === 'calculate') {
      return NextResponse.json({
        calculation,
        transactions_count: transactions.length,
        debug: debugInfo,
      });
    }

    // Выполнение выплаты через Cyclops Deal
    if (action === 'execute') {
      if (calculation.payout_amount <= 0) {
        return NextResponse.json(
          { error: 'Нет суммы к выплате', calculation },
          { status: 400 }
        );
      }

      // Проверяем настройки выплат
      const settings = getPlatformSettings();
      if (client.payout_type === 'none') {
        return NextResponse.json(
          { error: 'Шаблон выплаты не задан. Добавьте реквизиты клиента.' },
          { status: 400 }
        );
      }

      // Создаём локальную запись о выплате
      const payout = createClientPayout(calculation, user_id);
      updatePayoutStatus(payout.id, 'processing');

      // Формируем назначение платежа
      const period = `${calculation.period_start} — ${calculation.period_end}`;
      const purpose = resolveClientPayoutPurpose(client, period, settings.payout_purpose_template);

      // Формируем ext_key для идемпотентности
      const extKey = `payout_${payout.id}_${uuidv4().slice(0, 8)}`;

      try {
        const layer = getLayerFromRequest(request);
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
        if (virtual_account) {
          payerVirtualAccount = String(virtual_account);
        }
        if (!payerVirtualAccount && client.payout_virtual_account) {
          payerVirtualAccount = client.payout_virtual_account;
        }

        if (!payerVirtualAccount && beneficiaryId) {
          const resolved = await resolveVirtualAccountForBeneficiary(cyclopsClient, beneficiaryId);
          if (resolved.id) {
            payerVirtualAccount = resolved.id;
          } else if ('reason' in resolved && resolved.reason === 'multiple') {
            return NextResponse.json(
              { error: 'У бенефициара несколько виртуальных счетов. Нужен выбор плательщика.' },
              { status: 400 }
            );
          }
        }

        if (!payerVirtualAccount && settings.payout_virtual_account) {
          payerVirtualAccount = settings.payout_virtual_account;
        }

        if (!payerVirtualAccount) {
          return NextResponse.json(
            { error: 'Не удалось определить виртуальный счёт плательщика для выплаты.' },
            { status: 400 }
          );
        }

        // Формируем параметры deal
        const dealParams = buildDealParamsForClient(
          client,
          payerVirtualAccount,
          calculation.payout_amount,
          purpose,
          extKey
        );

        // 1. Создаём сделку
        const createResult = await cyclopsClient.call<{ deal_id: string }>('create_deal', dealParams);

        if (createResult.error) {
          updatePayoutStatus(
            payout.id, 'failed', undefined, JSON.stringify(createResult.error),
            `Cyclops create_deal: ${createResult.error.message}`
          );
          return NextResponse.json({
            error: 'Ошибка создания сделки в Cyclops',
            details: createResult.error,
            payout_id: payout.id,
          }, { status: 400 });
        }

        const dealId = (createResult.result as { deal_id: string }).deal_id;

        // 2. Загружаем документ в сделку (если загружен)
        if (client.document_filename) {
          const docBuffer = readClientDocument(id, client.document_filename);
          if (docBuffer) {
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
              console.error('[Client Payout] Document upload error: beneficiary_id not resolved');
              if (client.auto_payout_enabled) {
                updatePayoutStatus(
                  payout.id, 'failed', dealId,
                  undefined,
                  'Ошибка загрузки документа: beneficiary_id не найден'
                );
                return NextResponse.json({
                  error: 'Ошибка загрузки документа в сделку',
                  deal_id: dealId,
                  details: 'beneficiary_id не найден',
                  payout_id: payout.id,
                }, { status: 400 });
              }
            } else {
              const fallbackMime = resolveDocumentMimeType({ name: client.document_filename, type: '' });
              const contentType = client.document_mime_type || fallbackMime;
              if (!contentType || !isAllowedDealDocumentMimeType(contentType)) {
                console.error('[Client Payout] Document upload error: unsupported content-type', contentType);
                if (client.auto_payout_enabled) {
                  updatePayoutStatus(
                    payout.id, 'failed', dealId,
                    undefined,
                    'Ошибка загрузки документа: неподдерживаемый формат'
                  );
                  return NextResponse.json({
                    error: 'Ошибка загрузки документа в сделку',
                    deal_id: dealId,
                    details: 'Неподдерживаемый формат документа',
                    payout_id: payout.id,
                  }, { status: 400 });
                }
              } else {
                const docDate = (client.document_uploaded_at || new Date().toISOString()).split('T')[0];
                const docNumber = String(payout.id);
                const uploadResult = await uploadDealDocumentBinary({
                  layer,
                  beneficiary_id: docBeneficiaryId,
                  deal_id: dealId,
                  document_type: 'service_agreement',
                  document_date: docDate,
                  document_number: docNumber,
                  contentType,
                  body: docBuffer,
                });

                if (!uploadResult.ok) {
                  console.error('[Client Payout] Document upload error:', uploadResult.error);
                  if (client.auto_payout_enabled) {
                    updatePayoutStatus(
                      payout.id, 'failed', dealId,
                      JSON.stringify(uploadResult.error),
                      `Ошибка загрузки документа: ${uploadResult.error.message}`
                    );
                    return NextResponse.json({
                      error: 'Ошибка загрузки документа в сделку',
                      deal_id: dealId,
                      details: uploadResult.error,
                      payout_id: payout.id,
                    }, { status: 400 });
                  }
                }
              }
            }
          }
        }

        // 3. Исполняем сделку
        const executeResult = await cyclopsClient.call('execute_deal', { deal_id: dealId });

        if (executeResult.error) {
          // Сделка создана, но не исполнена — сохраняем deal_id, статус failed
          updatePayoutStatus(
            payout.id, 'failed', dealId, JSON.stringify(executeResult.error),
            `Cyclops execute_deal: ${executeResult.error.message}`
          );
          return NextResponse.json({
            error: 'Сделка создана, но ошибка при исполнении',
            deal_id: dealId,
            details: executeResult.error,
            payout_id: payout.id,
          }, { status: 400 });
        }

        // Успех
        updatePayoutStatus(
          payout.id, 'completed', dealId,
          JSON.stringify({ create: createResult.result, execute: executeResult.result })
        );

        return NextResponse.json({
          success: true,
          payout_id: payout.id,
          cyclops_deal_id: dealId,
          amount: calculation.payout_amount,
          client_name: client.name,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка Cyclops';
        updatePayoutStatus(payout.id, 'failed', undefined, undefined, errorMessage);

        return NextResponse.json({
          error: 'Ошибка при выплате через Cyclops',
          payout_id: payout.id,
          details: errorMessage,
        }, { status: 500 });
      }
    }

    return NextResponse.json(
      { error: 'Неизвестный action. Допустимые: calculate, execute' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Client Payout API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
