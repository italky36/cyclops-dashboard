import { NextRequest, NextResponse } from 'next/server';
import {
  createClient,
  getAllClients,
  getPlatformSettings,
  updatePlatformSettings,
} from '@/lib/clients';
import type { CreateClientInput, PayoutType } from '@/lib/clients';

// GET /api/clients — список клиентов или настройки платформы
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'platform_settings') {
      const settings = getPlatformSettings();
      return NextResponse.json({ settings });
    }

    const is_active = searchParams.get('is_active');
    const search = searchParams.get('search') || undefined;

    const clients = getAllClients({
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      search,
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('[Clients API] GET Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/clients — создание клиента или обновление настроек
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Обновление настроек платформы
    if (body.action === 'update_platform_settings') {
      const settings = updatePlatformSettings({
        payout_virtual_account: body.payout_virtual_account,
        payout_purpose_template: body.payout_purpose_template,
      }, body.user_id);
      return NextResponse.json({ settings });
    }

    // Валидация обязательных полей
    if (!body.name || !body.payout_type) {
      return NextResponse.json(
        { error: 'Поля name и payout_type обязательны' },
        { status: 400 }
      );
    }

    const validTypes: PayoutType[] = [
      'payment_contract',
      'payment_contract_by_sbp',
      'payment_contract_by_sbp_v2',
      'payment_contract_to_card',
      'none',
    ];
    if (!validTypes.includes(body.payout_type)) {
      return NextResponse.json(
        { error: `Недопустимый payout_type. Допустимые: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    const autoPayoutEnabled =
      body.auto_payout_enabled === true || body.auto_payout_enabled === 'true';
    if (body.payout_type === 'none' && autoPayoutEnabled) {
      return NextResponse.json(
        { error: 'Нельзя включить автовыплаты без шаблона выплаты' },
        { status: 400 }
      );
    }

    // Валидация реквизитов в зависимости от типа
    if (body.payout_type === 'payment_contract') {
      if (!body.bank_account || !body.bank_code || !body.inn) {
        return NextResponse.json(
          { error: 'Для банковского перевода обязательны: bank_account, bank_code, inn' },
          { status: 400 }
        );
      }
    }

    if (body.payout_type === 'payment_contract_by_sbp' || body.payout_type === 'payment_contract_by_sbp_v2') {
      if (!body.sbp_phone || !body.sbp_bank_id || !body.sbp_first_name || !body.sbp_last_name) {
        return NextResponse.json(
          { error: 'Для СБП обязательны: sbp_phone, sbp_bank_id, sbp_first_name, sbp_last_name' },
          { status: 400 }
        );
      }
    }

    if (body.payout_type === 'payment_contract_to_card') {
      if (!body.card_number_encrypted || !body.card_first_name || !body.card_last_name) {
        return NextResponse.json(
          { error: 'Для карты обязательны: card_number_encrypted, card_first_name, card_last_name' },
          { status: 400 }
        );
      }
    }

    const payoutExcludeDaysRaw =
      body.payout_exclude_days !== undefined && body.payout_exclude_days !== null
        ? Number(body.payout_exclude_days)
        : undefined;
    const payoutExcludeDays =
      typeof payoutExcludeDaysRaw === 'number' && Number.isNaN(payoutExcludeDaysRaw)
        ? 0
        : payoutExcludeDaysRaw;
    const nextPayoutAt =
      body.next_payout_at ||
      (autoPayoutEnabled ? new Date().toISOString().split('T')[0] : undefined);

    const input: CreateClientInput = {
      name: body.name,
      contact_name: body.contact_name,
      phone: body.phone,
      email: body.email,
      payout_type: body.payout_type,
      bank_account: body.bank_account,
      bank_code: body.bank_code,
      bank_name: body.bank_name,
      inn: body.inn,
      kpp: body.kpp,
      recipient_name: body.recipient_name,
      payout_purpose: body.payout_purpose,
      sbp_phone: body.sbp_phone,
      sbp_bank_id: body.sbp_bank_id,
      sbp_first_name: body.sbp_first_name,
      sbp_middle_name: body.sbp_middle_name,
      sbp_last_name: body.sbp_last_name,
      card_number_encrypted: body.card_number_encrypted,
      card_first_name: body.card_first_name,
      card_middle_name: body.card_middle_name,
      card_last_name: body.card_last_name,
      beneficiary_id: body.beneficiary_id,
      notes: body.notes,
      commission_percent: body.commission_percent,
      payout_frequency: body.payout_frequency,
      payout_exclude_days: payoutExcludeDays,
      auto_payout_enabled: autoPayoutEnabled,
      next_payout_at: nextPayoutAt,
    };

    const client = createClient(input, body.user_id);

    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error('[Clients API] POST Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
