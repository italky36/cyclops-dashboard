import { NextRequest, NextResponse } from 'next/server';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';

type VirtualAccountRecord = {
  id: string;
  virtual_account?: string;
  balance?: number;
  type?: string;
};

const mapVirtualAccountRecord = (item: unknown): VirtualAccountRecord | null => {
  if (!item || typeof item !== 'object') return null;
  const record = item as {
    id?: string;
    virtual_account?: string;
    balance?: number;
    cash?: number;
    type?: string;
  };
  const id = record.id || record.virtual_account;
  if (!id) return null;
  return {
    id,
    virtual_account: record.virtual_account,
    balance: typeof record.balance === 'number' ? record.balance : record.cash,
    type: record.type,
  };
};

export async function GET(request: NextRequest) {
  try {
    const layer = getLayerFromRequest(request);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const perPage = searchParams.get('per_page') ? Number(searchParams.get('per_page')) : 100;

    const client = await getCyclopsClient(layer);
    const listResult = await client.call('list_virtual_account', {
      page,
      per_page: perPage,
    });

    if (listResult.error) {
      return NextResponse.json(
        { error: listResult.error.message, code: listResult.error.code },
        { status: 400 }
      );
    }

    const list = (listResult.result as { virtual_accounts?: unknown[] } | undefined)?.virtual_accounts;
    if (!Array.isArray(list) || list.length === 0) {
      return NextResponse.json({ virtual_accounts: [] });
    }

    let accounts: VirtualAccountRecord[] = [];

    if (typeof list[0] === 'string') {
      const ids = list.filter((item): item is string => typeof item === 'string');
      const details = await Promise.all(
        ids.map(async (accountId) => {
          try {
            const detailResult = await client.call('get_virtual_account', {
              virtual_account: accountId,
            });
            if (detailResult.error) return null;
            const detail = (detailResult.result as { virtual_account?: { code?: string; cash?: number; type?: string } } | undefined)
              ?.virtual_account;
            if (!detail) return null;
            return {
              id: detail.code || accountId,
              virtual_account: accountId,
              balance: typeof detail.cash === 'number' ? detail.cash : undefined,
              type: detail.type,
            } satisfies VirtualAccountRecord;
          } catch {
            return null;
          }
        })
      );
      accounts = details.filter(Boolean) as VirtualAccountRecord[];
    } else {
      accounts = list.map(mapVirtualAccountRecord).filter(Boolean) as VirtualAccountRecord[];
    }

    if (type) {
      accounts = accounts.filter((account) => account.type === type);
    }

    return NextResponse.json({ virtual_accounts: accounts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка загрузки виртуальных счетов' },
      { status: 500 }
    );
  }
}
