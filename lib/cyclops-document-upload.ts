import { z } from 'zod';
import { uuidSchema, dateSchema } from './cyclops-validators';

export const DEAL_UPLOAD_ERROR_CODES = {
  NO_VALID_DATA_IN_REQUEST: 4002,
  NOT_SUPPORTED_CONTENT_TYPE: 4402,
} as const;

export const uploadDealDocumentQuerySchema = z.object({
  beneficiary_id: uuidSchema,
  deal_id: uuidSchema,
  document_type: z.string().min(1, 'document_type required'),
  document_date: dateSchema,
  document_number: z.string().min(1, 'document_number required'),
});

export type UploadDealDocumentQuery = z.infer<typeof uploadDealDocumentQuerySchema>;

export const uploadDealDocumentSuccessSchema = z.object({
  document_id: z.string(),
});

export const uploadDealDocumentErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    meta: z.unknown().optional(),
  }),
});

export function buildDealUploadUrl(baseUrl: string, params: UploadDealDocumentQuery): string {
  const query = new URLSearchParams({
    beneficiary_id: params.beneficiary_id,
    deal_id: params.deal_id,
    document_type: params.document_type,
  });

  if (params.document_date) {
    query.set('document_date', params.document_date);
  }
  if (params.document_number) {
    query.set('document_number', params.document_number);
  }

  return `${baseUrl}?${query.toString()}`;
}

export function normalizeUploadDocumentError(
  payload: unknown,
  fallbackCode: number,
  fallbackMessage?: string
): { error: { code: number; message: string; meta?: unknown } } {
  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, unknown>;
    if ('error' in data) {
      const errorValue = data.error;
      if (errorValue && typeof errorValue === 'object') {
        const errorObject = errorValue as { code?: unknown; message?: unknown; meta?: unknown };
        if (typeof errorObject.code === 'number' && typeof errorObject.message === 'string') {
          return {
            error: {
              code: errorObject.code,
              message: errorObject.message,
              meta: errorObject.meta,
            },
          };
        }
      }
      if (typeof errorValue === 'string') {
        return { error: { code: fallbackCode, message: errorValue } };
      }
    }
    if (typeof data.message === 'string') {
      return { error: { code: fallbackCode, message: data.message } };
    }
    if (typeof data.raw === 'string') {
      return { error: { code: fallbackCode, message: data.raw } };
    }
  }

  return {
    error: {
      code: fallbackCode,
      message: fallbackMessage || `HTTP ${fallbackCode}`,
    },
  };
}
