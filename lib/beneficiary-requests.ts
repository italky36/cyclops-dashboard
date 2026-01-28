export type CreateBeneficiaryIpInput = {
  inn: string;
  nominal_account_code?: string;
  nominal_account_bic?: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    tax_resident?: boolean;
  };
};

export type CreateBeneficiaryFlInput = {
  inn: string;
  nominal_account_code?: string;
  nominal_account_bic?: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    birth_date: string;
    birth_place: string;
    passport_series?: string;
    passport_number: string;
    passport_date: string;
    registration_address: string;
    resident?: boolean;
    reg_country_code?: string;
    tax_resident?: boolean;
  };
};

export type UpdateBeneficiaryUlInput = {
  beneficiary_id: string;
  beneficiary_data: {
    name: string;
    kpp: string;
    ogrn?: string;
    is_active_activity?: boolean;
  };
};

export type UpdateBeneficiaryIpInput = {
  beneficiary_id: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    tax_resident?: boolean;
  };
};

export type UpdateBeneficiaryFlInput = {
  beneficiary_id: string;
  beneficiary_data: {
    first_name: string;
    middle_name?: string;
    last_name: string;
    birth_date: string;
    birth_place: string;
    passport_series: string;
    passport_number: string;
    passport_date: string;
    registration_address: string;
    tax_resident?: boolean;
  };
};

const digitsOnly = (value: string) => value.replace(/\D+/g, '');

export function buildCreateBeneficiaryIpParams(input: CreateBeneficiaryIpInput): CreateBeneficiaryIpInput {
  return {
    ...input,
    inn: digitsOnly(input.inn),
    nominal_account_code: input.nominal_account_code
      ? digitsOnly(input.nominal_account_code)
      : undefined,
    nominal_account_bic: input.nominal_account_bic
      ? digitsOnly(input.nominal_account_bic)
      : undefined,
    beneficiary_data: {
      ...input.beneficiary_data,
      first_name: input.beneficiary_data.first_name.trim(),
      middle_name: input.beneficiary_data.middle_name?.trim() || undefined,
      last_name: input.beneficiary_data.last_name.trim(),
    },
  };
}

export function buildCreateBeneficiaryFlParams(input: CreateBeneficiaryFlInput): CreateBeneficiaryFlInput {
  return {
    ...input,
    inn: digitsOnly(input.inn),
    nominal_account_code: input.nominal_account_code
      ? digitsOnly(input.nominal_account_code)
      : undefined,
    nominal_account_bic: input.nominal_account_bic
      ? digitsOnly(input.nominal_account_bic)
      : undefined,
    beneficiary_data: {
      ...input.beneficiary_data,
      first_name: input.beneficiary_data.first_name.trim(),
      middle_name: input.beneficiary_data.middle_name?.trim() || undefined,
      last_name: input.beneficiary_data.last_name.trim(),
      birth_place: input.beneficiary_data.birth_place.trim(),
      passport_series: input.beneficiary_data.passport_series
        ? digitsOnly(input.beneficiary_data.passport_series)
        : undefined,
      passport_number: digitsOnly(input.beneficiary_data.passport_number),
      registration_address: input.beneficiary_data.registration_address.trim(),
      reg_country_code: input.beneficiary_data.reg_country_code?.trim() || undefined,
    },
  };
}

export function buildUpdateBeneficiaryUlParams(input: UpdateBeneficiaryUlInput): UpdateBeneficiaryUlInput {
  return {
    ...input,
    beneficiary_data: {
      ...input.beneficiary_data,
      name: input.beneficiary_data.name.trim(),
      kpp: digitsOnly(input.beneficiary_data.kpp),
      ogrn: input.beneficiary_data.ogrn ? digitsOnly(input.beneficiary_data.ogrn) : undefined,
      is_active_activity: input.beneficiary_data.is_active_activity ?? true,
    },
  };
}

export function buildUpdateBeneficiaryIpParams(input: UpdateBeneficiaryIpInput): UpdateBeneficiaryIpInput {
  return {
    ...input,
    beneficiary_data: {
      ...input.beneficiary_data,
      first_name: input.beneficiary_data.first_name.trim(),
      middle_name: input.beneficiary_data.middle_name?.trim() || undefined,
      last_name: input.beneficiary_data.last_name.trim(),
      tax_resident: input.beneficiary_data.tax_resident ?? true,
    },
  };
}

export function buildUpdateBeneficiaryFlParams(input: UpdateBeneficiaryFlInput): UpdateBeneficiaryFlInput {
  return {
    ...input,
    beneficiary_data: {
      ...input.beneficiary_data,
      first_name: input.beneficiary_data.first_name.trim(),
      middle_name: input.beneficiary_data.middle_name?.trim() || undefined,
      last_name: input.beneficiary_data.last_name.trim(),
      birth_place: input.beneficiary_data.birth_place.trim(),
      passport_series: digitsOnly(input.beneficiary_data.passport_series),
      passport_number: digitsOnly(input.beneficiary_data.passport_number),
      registration_address: input.beneficiary_data.registration_address.trim(),
      tax_resident: input.beneficiary_data.tax_resident ?? true,
    },
  };
}
