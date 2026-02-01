export const MAX_DEAL_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

export const DEAL_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/pjpeg',
  'image/png',
  'image/tiff',
  'image/x-tiff',
  'image/bmp',
  'image/x-windows-bmp',
  'image/x-ms-bmp',
  'image/ms-bmp',
  'image/x-bmp',
] as const;

export type DealDocumentMimeType = typeof DEAL_DOCUMENT_MIME_TYPES[number];

export interface FileLike {
  name?: string;
  type?: string;
  size: number;
}

const EXTENSION_TO_MIME: Record<string, DealDocumentMimeType> = {
  pdf: 'application/pdf',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
};

export function isAllowedDealDocumentMimeType(value: string): value is DealDocumentMimeType {
  return (DEAL_DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function resolveDocumentMimeType(file: Pick<FileLike, 'name' | 'type'>): string {
  const rawType = (file.type || '').trim().toLowerCase();
  if (rawType) return rawType;

  const name = (file.name || '').toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  if (!match) return '';
  return EXTENSION_TO_MIME[match[1]] || '';
}

export function validateDealDocumentFile(file?: FileLike | null): string | null {
  if (!file) return 'Выберите файл';
  if (file.size <= 0) return 'Файл пустой';
  if (file.size > MAX_DEAL_DOCUMENT_SIZE_BYTES) {
    return 'Размер файла не должен превышать 25 МБ';
  }
  const mime = resolveDocumentMimeType(file);
  if (!mime || !isAllowedDealDocumentMimeType(mime)) {
    return 'Поддерживаемые форматы: PDF, GIF, JPG, PNG, TIFF, BMP';
  }
  return null;
}
