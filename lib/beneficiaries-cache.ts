import { getDb } from '@/lib/db';

type BeneficiaryListItem = {
  id?: string;
  beneficiary_id?: string;
  inn?: string;
  is_active?: boolean;
  legal_type?: string;
  nominal_account_code?: string;
  nominal_account_bic?: string;
  beneficiary_data?: {
    name?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    kpp?: string;
    ogrn?: string;
    ogrnip?: string;
    birth_date?: string;
  };
};

type BeneficiaryDetail = {
  id?: string;
  beneficiary_id?: string;
  inn?: string;
  is_active?: boolean;
  legal_type?: string;
  beneficiary_data?: {
    name?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    kpp?: string;
    ogrn?: string;
    ogrnip?: string;
    birth_date?: string;
  };
  nominal_account?: {
    code?: string;
    bic?: string;
  };
  nominal_account_code?: string;
  nominal_account_bic?: string;
  is_added_to_ms?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CachedBeneficiary = {
  beneficiary_id: string;
  inn: string | null;
  legal_type: string | null;
  is_active: boolean | null;
  nominal_account_code: string | null;
  nominal_account_bic: string | null;
  name: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  kpp: string | null;
  ogrn: string | null;
  ogrnip: string | null;
  birth_date: string | null;
  is_added_to_ms: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  last_sync_at: number | null;
};

const toBool = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return null;
};

const normalizeId = (value?: string) => (value && value !== 'undefined' ? value : '');

export function upsertBeneficiariesFromList(list: BeneficiaryListItem[]): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO beneficiaries_cache (
      beneficiary_id, inn, legal_type, is_active, nominal_account_code, nominal_account_bic,
      name, first_name, middle_name, last_name, kpp, ogrn, ogrnip, birth_date,
      is_added_to_ms, created_at, updated_at, last_sync_at
    ) VALUES (
      @beneficiary_id, @inn, @legal_type, @is_active, @nominal_account_code, @nominal_account_bic,
      @name, @first_name, @middle_name, @last_name, @kpp, @ogrn, @ogrnip, @birth_date,
      @is_added_to_ms, @created_at, @updated_at, @last_sync_at
    )
    ON CONFLICT(beneficiary_id) DO UPDATE SET
      inn = COALESCE(excluded.inn, beneficiaries_cache.inn),
      legal_type = COALESCE(excluded.legal_type, beneficiaries_cache.legal_type),
      is_active = COALESCE(excluded.is_active, beneficiaries_cache.is_active),
      nominal_account_code = COALESCE(excluded.nominal_account_code, beneficiaries_cache.nominal_account_code),
      nominal_account_bic = COALESCE(excluded.nominal_account_bic, beneficiaries_cache.nominal_account_bic),
      name = COALESCE(excluded.name, beneficiaries_cache.name),
      first_name = COALESCE(excluded.first_name, beneficiaries_cache.first_name),
      middle_name = COALESCE(excluded.middle_name, beneficiaries_cache.middle_name),
      last_name = COALESCE(excluded.last_name, beneficiaries_cache.last_name),
      kpp = COALESCE(excluded.kpp, beneficiaries_cache.kpp),
      ogrn = COALESCE(excluded.ogrn, beneficiaries_cache.ogrn),
      ogrnip = COALESCE(excluded.ogrnip, beneficiaries_cache.ogrnip),
      birth_date = COALESCE(excluded.birth_date, beneficiaries_cache.birth_date),
      last_sync_at = excluded.last_sync_at
  `);

  const tx = db.transaction((rows: BeneficiaryListItem[]) => {
    rows.forEach((row) => {
      const beneficiary_id = normalizeId(row.beneficiary_id || row.id);
      if (!beneficiary_id) return;
      const data = row.beneficiary_data || {};
      stmt.run({
        beneficiary_id,
        inn: row.inn || null,
        legal_type: row.legal_type || null,
        is_active: typeof row.is_active === 'boolean' ? Number(row.is_active) : null,
        nominal_account_code: row.nominal_account_code || null,
        nominal_account_bic: row.nominal_account_bic || null,
        name: data.name || null,
        first_name: data.first_name || null,
        middle_name: data.middle_name || null,
        last_name: data.last_name || null,
        kpp: data.kpp || null,
        ogrn: data.ogrn || null,
        ogrnip: data.ogrnip || null,
        birth_date: data.birth_date || null,
        is_added_to_ms: null,
        created_at: null,
        updated_at: null,
        last_sync_at: now,
      });
    });
  });

  tx(list);
}

export function upsertBeneficiaryFromDetail(detail: BeneficiaryDetail): void {
  const db = getDb();
  const now = Date.now();
  const detailId = normalizeId(detail.beneficiary_id || detail.id);
  if (!detailId) return;
  const data = detail.beneficiary_data || {};
  const nominalAccountCode = detail.nominal_account?.code || detail.nominal_account_code || null;
  const nominalAccountBic = detail.nominal_account?.bic || detail.nominal_account_bic || null;

  db.prepare(`
    INSERT INTO beneficiaries_cache (
      beneficiary_id, inn, legal_type, is_active, nominal_account_code, nominal_account_bic,
      name, first_name, middle_name, last_name, kpp, ogrn, ogrnip, birth_date,
      is_added_to_ms, created_at, updated_at, last_sync_at
    ) VALUES (
      @beneficiary_id, @inn, @legal_type, @is_active, @nominal_account_code, @nominal_account_bic,
      @name, @first_name, @middle_name, @last_name, @kpp, @ogrn, @ogrnip, @birth_date,
      @is_added_to_ms, @created_at, @updated_at, @last_sync_at
    )
    ON CONFLICT(beneficiary_id) DO UPDATE SET
      inn = COALESCE(excluded.inn, beneficiaries_cache.inn),
      legal_type = COALESCE(excluded.legal_type, beneficiaries_cache.legal_type),
      is_active = COALESCE(excluded.is_active, beneficiaries_cache.is_active),
      nominal_account_code = COALESCE(excluded.nominal_account_code, beneficiaries_cache.nominal_account_code),
      nominal_account_bic = COALESCE(excluded.nominal_account_bic, beneficiaries_cache.nominal_account_bic),
      name = COALESCE(excluded.name, beneficiaries_cache.name),
      first_name = COALESCE(excluded.first_name, beneficiaries_cache.first_name),
      middle_name = COALESCE(excluded.middle_name, beneficiaries_cache.middle_name),
      last_name = COALESCE(excluded.last_name, beneficiaries_cache.last_name),
      kpp = COALESCE(excluded.kpp, beneficiaries_cache.kpp),
      ogrn = COALESCE(excluded.ogrn, beneficiaries_cache.ogrn),
      ogrnip = COALESCE(excluded.ogrnip, beneficiaries_cache.ogrnip),
      birth_date = COALESCE(excluded.birth_date, beneficiaries_cache.birth_date),
      is_added_to_ms = COALESCE(excluded.is_added_to_ms, beneficiaries_cache.is_added_to_ms),
      created_at = COALESCE(excluded.created_at, beneficiaries_cache.created_at),
      updated_at = COALESCE(excluded.updated_at, beneficiaries_cache.updated_at),
      last_sync_at = excluded.last_sync_at
  `).run({
    beneficiary_id: detailId,
    inn: detail.inn || null,
    legal_type: detail.legal_type || null,
    is_active: typeof detail.is_active === 'boolean' ? Number(detail.is_active) : null,
    nominal_account_code: nominalAccountCode,
    nominal_account_bic: nominalAccountBic,
    name: data.name || null,
    first_name: data.first_name || null,
    middle_name: data.middle_name || null,
    last_name: data.last_name || null,
    kpp: data.kpp || null,
    ogrn: data.ogrn || null,
    ogrnip: data.ogrnip || null,
    birth_date: data.birth_date || null,
    is_added_to_ms: typeof detail.is_added_to_ms === 'boolean' ? Number(detail.is_added_to_ms) : null,
    created_at: detail.created_at || null,
    updated_at: detail.updated_at || null,
    last_sync_at: now,
  });
}

export function listCachedBeneficiaries(): CachedBeneficiary[] {
  const db = getDb();
  return db.prepare('SELECT * FROM beneficiaries_cache ORDER BY COALESCE(updated_at, created_at) DESC').all() as CachedBeneficiary[];
}

export function getCachedBeneficiariesByIds(ids: string[]): CachedBeneficiary[] {
  if (!ids.length) return [];
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM beneficiaries_cache WHERE beneficiary_id IN (${placeholders})`).all(...ids) as CachedBeneficiary[];
}

export function getBeneficiariesLastSyncAt(): number | null {
  const db = getDb();
  const row = db.prepare('SELECT MAX(last_sync_at) as last_sync_at FROM beneficiaries_cache').get() as { last_sync_at?: number | null };
  return row?.last_sync_at ?? null;
}

export function mapCachedToApi(
  list: BeneficiaryListItem[],
  cached: CachedBeneficiary[]
): BeneficiaryListItem[] {
  const map = new Map(cached.map((c) => [c.beneficiary_id, c]));
  return list.map((item) => {
    const beneficiaryId = normalizeId(item.beneficiary_id || item.id);
    const cachedItem = beneficiaryId ? map.get(beneficiaryId) : null;
    if (!cachedItem) return item;

    return {
      ...item,
      beneficiary_data: {
        ...(item.beneficiary_data || {}),
        name: cachedItem.name || item.beneficiary_data?.name,
        first_name: cachedItem.first_name || item.beneficiary_data?.first_name,
        middle_name: cachedItem.middle_name || item.beneficiary_data?.middle_name,
        last_name: cachedItem.last_name || item.beneficiary_data?.last_name,
        kpp: cachedItem.kpp || item.beneficiary_data?.kpp,
        ogrn: cachedItem.ogrn || item.beneficiary_data?.ogrn,
        ogrnip: cachedItem.ogrnip || item.beneficiary_data?.ogrnip,
        birth_date: cachedItem.birth_date || item.beneficiary_data?.birth_date,
      },
      is_added_to_ms: cachedItem.is_added_to_ms ?? item.is_added_to_ms,
      created_at: cachedItem.created_at || (item as any).created_at,
      updated_at: cachedItem.updated_at || (item as any).updated_at,
    };
  });
}

export function toBooleanFromDb(value: unknown): boolean | null {
  return toBool(value);
}
