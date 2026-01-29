'use client';

import { useEffect, useMemo, useState } from 'react';
import { DealForm } from '@/components/deals/DealForm';
import { useDeal } from '@/hooks/useDeals';
import type { CreateDealParams, DealRecipientInfo, DealRecipient } from '@/types/cyclops/deals';

const mapRecipientRequisites = (recipient: DealRecipientInfo): DealRecipient => {
  const requisites = (recipient.requisites || {}) as Record<string, unknown>;

  switch (recipient.type) {
    case 'payment_contract':
      return {
        type: recipient.type,
        number: recipient.number,
        amount: recipient.amount,
        account: String(requisites.account || ''),
        bank_code: String(requisites.bank_code || ''),
        name: String(requisites.name || ''),
        inn: String(requisites.inn || ''),
        kpp: requisites.kpp ? String(requisites.kpp) : undefined,
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
        purpose_nds: typeof requisites.purpose_nds === 'number' ? requisites.purpose_nds : undefined,
        document_number: requisites.document_number ? String(requisites.document_number) : undefined,
        identifier: requisites.identifier ? String(requisites.identifier) : undefined,
        code_purpose: requisites.code_purpose as '1' | '2' | '3' | '4' | '5' | undefined,
      };
    case 'commission':
      return {
        type: recipient.type,
        number: recipient.number,
        amount: recipient.amount,
        name: String(requisites.name || ''),
        kpp: requisites.kpp ? String(requisites.kpp) : undefined,
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
        purpose_nds: typeof requisites.purpose_nds === 'number' ? requisites.purpose_nds : undefined,
        purpose_type: requisites.purpose_type as 'standard' | 'with_inn' | undefined,
        document_number: requisites.document_number ? String(requisites.document_number) : undefined,
      };
    case 'payment_contract_by_sbp':
    case 'payment_contract_by_sbp_v2':
      return {
        type: recipient.type,
        number: recipient.number,
        amount: recipient.amount,
        first_name: String(requisites.first_name || ''),
        last_name: String(requisites.last_name || ''),
        middle_name: requisites.middle_name ? String(requisites.middle_name) : undefined,
        phone_number: String(requisites.phone_number || ''),
        bank_sbp_id: String(requisites.bank_sbp_id || ''),
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
        purpose_nds: typeof requisites.purpose_nds === 'number' ? requisites.purpose_nds : undefined,
        identifier: requisites.identifier ? String(requisites.identifier) : undefined,
        inn: requisites.inn ? String(requisites.inn) : undefined,
      };
    case 'payment_contract_to_card':
      return {
        type: recipient.type,
        number: recipient.number,
        amount: recipient.amount,
        card_number_crypto_base64: String(requisites.card_number_crypto_base64 || ''),
        purpose: requisites.purpose ? String(requisites.purpose) : undefined,
        document_number: requisites.document_number ? String(requisites.document_number) : undefined,
        identifier: requisites.identifier ? String(requisites.identifier) : undefined,
        inn: requisites.inn ? String(requisites.inn) : undefined,
      };
    case 'ndfl_to_virtual_account':
      return {
        type: recipient.type,
        number: recipient.number,
        amount: recipient.amount,
        virtual_account: String(requisites.virtual_account || ''),
      };
    default:
      return {
        type: recipient.type,
        number: recipient.number,
        amount: recipient.amount,
      } as DealRecipient;
  }
};

export default function EditDealPage({ params }: { params: { dealId: string } }) {
  const { deal, loading, error, updateDeal } = useDeal(params.dealId);
  const [initialData, setInitialData] = useState<CreateDealParams | null>(null);

  useEffect(() => {
    if (!deal) return;

    setInitialData({
      ext_key: deal.ext_key,
      amount: deal.amount,
      payers: deal.payers.map((payer) => ({
        virtual_account: payer.virtual_account,
        amount: payer.amount,
      })),
      recipients: deal.recipients.map((recipient) => mapRecipientRequisites(recipient)),
    });
  }, [deal]);

  const handleUpdate = useMemo(() => {
    return async (payload: CreateDealParams) => {
      await updateDeal(payload);
      return {};
    };
  }, [updateDeal]);

  if (loading && !deal) {
    return <div className="loading">Загрузка...</div>;
  }

  if (error || !deal) {
    return <div className="card">{error || 'Сделка не найдена'}</div>;
  }

  if (!initialData) {
    return <div className="loading">Подготовка формы...</div>;
  }

  return (
    <div className="stack stack-lg">
      <div className="page-header">
        <h1 className="page-title">Редактирование сделки</h1>
      </div>
      <DealForm initialData={initialData} onSubmit={handleUpdate} submitLabel="Сохранить изменения" />
    </div>
  );
}
