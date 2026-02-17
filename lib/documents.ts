import fs from 'fs';
import path from 'path';

const DOCUMENTS_BASE_DIR = process.env.DOCUMENTS_PATH
  || path.join(process.cwd(), 'data', 'documents');

function getClientDocDir(clientId: number): string {
  return path.join(DOCUMENTS_BASE_DIR, String(clientId));
}

/**
 * Сохраняет документ клиента на локальную ФС.
 * Для каждого клиента хранится один документ (contract.ext).
 */
export function saveClientDocument(
  clientId: number,
  filename: string,
  buffer: Buffer
): string {
  const dir = getClientDocDir(clientId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Фиксированное имя — один документ на клиента
  const ext = path.extname(filename);
  const storedFilename = `contract${ext}`;
  const filePath = path.join(dir, storedFilename);
  fs.writeFileSync(filePath, buffer);
  return storedFilename;
}

/**
 * Возвращает полный путь к документу клиента, если он существует.
 */
export function getClientDocumentPath(clientId: number, filename: string): string | null {
  const filePath = path.join(getClientDocDir(clientId), filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

/**
 * Читает документ клиента в Buffer.
 */
export function readClientDocument(clientId: number, filename: string): Buffer | null {
  const filePath = getClientDocumentPath(clientId, filename);
  if (!filePath) return null;
  return fs.readFileSync(filePath);
}

/**
 * Удаляет документ клиента с диска.
 */
export function deleteClientDocument(clientId: number, filename: string): boolean {
  const filePath = getClientDocumentPath(clientId, filename);
  if (!filePath) return false;
  fs.unlinkSync(filePath);
  return true;
}

/**
 * Читает документ и возвращает как base64-строку (для отправки в Cyclops API).
 */
export function getClientDocumentBase64(clientId: number, filename: string): string | null {
  const buffer = readClientDocument(clientId, filename);
  if (!buffer) return null;
  return buffer.toString('base64');
}
