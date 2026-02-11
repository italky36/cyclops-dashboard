import { NextRequest, NextResponse } from 'next/server';
import { getClientById, updateClient } from '@/lib/clients';
import {
  saveClientDocument,
  readClientDocument,
  deleteClientDocument,
} from '@/lib/documents';
import {
  MAX_DEAL_DOCUMENT_SIZE_BYTES,
  isAllowedDealDocumentMimeType,
  resolveDocumentMimeType,
} from '@/lib/cyclops-document-utils';
import { logAction } from '@/lib/vending';

// POST /api/clients/[clientId]/document — загрузить документ
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseInt(clientId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Файл не передан' }, { status: 400 });
    }

    // Валидация размера
    if (file.size > MAX_DEAL_DOCUMENT_SIZE_BYTES) {
      return NextResponse.json({ error: 'Размер файла не должен превышать 25 МБ' }, { status: 413 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'Файл пустой' }, { status: 400 });
    }

    // Валидация MIME-типа
    const mimeType = resolveDocumentMimeType({ name: file.name, type: file.type });
    if (!mimeType || !isAllowedDealDocumentMimeType(mimeType)) {
      return NextResponse.json(
        { error: 'Поддерживаемые форматы: PDF, GIF, JPG, PNG, TIFF, BMP' },
        { status: 415 }
      );
    }

    // Сохраняем на диск
    const buffer = Buffer.from(await file.arrayBuffer());
    const storedFilename = saveClientDocument(id, file.name, buffer);

    // Обновляем запись клиента
    updateClient(id, {
      document_filename: storedFilename,
      document_mime_type: mimeType,
      document_uploaded_at: new Date().toISOString(),
    });

    logAction('upload_client_document', 'client', String(id), JSON.stringify({
      filename: storedFilename,
      original_name: file.name,
      size: file.size,
      mime_type: mimeType,
    }));

    return NextResponse.json({
      success: true,
      filename: storedFilename,
      mime_type: mimeType,
    });
  } catch (error) {
    console.error('[Client Document Upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка загрузки документа' },
      { status: 500 }
    );
  }
}

// GET /api/clients/[clientId]/document — скачать документ
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseInt(clientId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    if (!client.document_filename) {
      return NextResponse.json({ error: 'Документ не загружен' }, { status: 404 });
    }

    const buffer = readClientDocument(id, client.document_filename);
    if (!buffer) {
      return NextResponse.json({ error: 'Файл не найден на диске' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': client.document_mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${client.document_filename}"`,
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('[Client Document Download] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка скачивания' },
      { status: 500 }
    );
  }
}

// DELETE /api/clients/[clientId]/document — удалить документ
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseInt(clientId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    if (!client.document_filename) {
      return NextResponse.json({ error: 'Документ не загружен' }, { status: 404 });
    }

    // Запрещаем удаление если автовыплаты включены
    if (client.auto_payout_enabled) {
      return NextResponse.json(
        { error: 'Нельзя удалить документ пока включены автовыплаты. Сначала отключите автовыплаты.' },
        { status: 400 }
      );
    }

    deleteClientDocument(id, client.document_filename);

    updateClient(id, {
      document_filename: null,
      document_mime_type: null,
      document_uploaded_at: null,
    });

    logAction('delete_client_document', 'client', String(id), JSON.stringify({
      filename: client.document_filename,
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Client Document Delete] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка удаления' },
      { status: 500 }
    );
  }
}
