import type { CreateBeneficiaryParams } from '@/types/cyclops';

export type CreateBeneficiaryInput = {
  legal_type: 'F' | 'I';
  inn: string;
  registration_address: string;
  tax_resident?: boolean;
  nominal_account_code?: string;
  nominal_account_bic?: string;
};

export function buildCreateBeneficiaryParams(input: CreateBeneficiaryInput): CreateBeneficiaryParams {
  const inn = input.inn.replace(/\D+/g, '');
  const registrationAddress = input.registration_address.trim();
  const params: CreateBeneficiaryParams = {
    legal_type: input.legal_type,
    inn,
    beneficiary_data: {
      registration_address: registrationAddress,
      tax_resident: input.tax_resident ?? true,
    },
  };

  const code = input.nominal_account_code?.trim();
  const bic = input.nominal_account_bic?.trim();
  if (code || bic) {
    params.nominal_accoun_data = {
      code: code || '',
      bic: bic || '',
    };
  }

  return params;
}
