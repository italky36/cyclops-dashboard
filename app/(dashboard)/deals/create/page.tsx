'use client';

import { DealForm } from '@/components/deals/DealForm';
import { useCreateDeal } from '@/hooks/useDeals';

export default function CreateDealPage() {
  const { createDeal } = useCreateDeal();

  return (
    <div className="stack stack-lg">
      <div className="page-header">
        <h1 className="page-title">Создание сделки</h1>
      </div>
      <DealForm onSubmit={createDeal} submitLabel="Создать сделку" />
    </div>
  );
}
