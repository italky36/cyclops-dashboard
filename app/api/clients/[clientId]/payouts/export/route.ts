import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { getClientById } from '@/lib/clients';
import { getPayoutHistory } from '@/lib/vending';
import { getCyclopsClient, getLayerFromRequest } from '@/lib/cyclops-helpers';
import { DEAL_STATUS_LABELS } from '@/lib/utils/deals';
import { parseClientIdParam } from '@/lib/client-slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  processing: 'В процессе',
  completed: 'Выполнена',
  failed: 'Ошибка',
};

const toDateOnly = (value: Date) => value.toISOString().split('T')[0];

const formatDateTime = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
};

const formatMoney = (value: number) => value.toFixed(2);

const csvEscape = (value: string) => {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const resolveFontPath = () => {
  const candidates = [
    process.env.PDF_FONT_PATH,
    path.join(process.cwd(), 'files', 'fonts', 'DejaVuSans.ttf'),
    path.join(process.cwd(), 'files', 'fonts', 'Arial.ttf'),
    'C:\\\\Windows\\\\Fonts\\\\arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const id = parseClientIdParam(clientId);
    if (!id) {
      return NextResponse.json({ error: 'Некорректный ID клиента' }, { status: 400 });
    }

    const client = getClientById(id);
    if (!client) {
      return NextResponse.json({ error: 'Клиент не найден' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get('format') || 'pdf').toLowerCase();
    const layer = getLayerFromRequest(request);

    const today = new Date();
    const defaultTo = toDateOnly(today);
    const defaultFromDate = new Date(today);
    defaultFromDate.setMonth(defaultFromDate.getMonth() - 1);
    const defaultFrom = toDateOnly(defaultFromDate);

    const dateFrom = searchParams.get('date_from') || defaultFrom;
    const dateTo = searchParams.get('date_to') || defaultTo;

    const payouts = getPayoutHistory({
      client_id: id,
      date_from: dateFrom,
      date_to: dateTo,
    });

    const dealIds = payouts
      .map((p) => p.cyclops_deal_id)
      .filter((dealId): dealId is string => !!dealId);

    const dealStatuses: Record<string, string> = {};
    if (dealIds.length > 0) {
      try {
        const cyclopsClient = await getCyclopsClient(layer);
        await Promise.all(dealIds.map(async (dealId) => {
          try {
            const result = await cyclopsClient.call('get_deal', { deal_id: dealId });
            if (!result.error) {
              const status = (result.result as { deal?: { status?: string } } | undefined)?.deal?.status;
              if (status) {
                dealStatuses[dealId] = DEAL_STATUS_LABELS[status as keyof typeof DEAL_STATUS_LABELS] || status;
              }
            }
          } catch {
            // ignore single deal error
          }
        }));
      } catch {
        // ignore Cyclops errors for export
      }
    }

    const rows = payouts.map((payout) => ({
      client: client.name,
      period: `${payout.period_start} — ${payout.period_end}`,
      amount: payout.total_sales,
      commission: payout.commission_amount,
      payout: payout.payout_amount,
      payout_status: PAYOUT_STATUS_LABELS[payout.status] || payout.status,
      deal_id: payout.cyclops_deal_id || '—',
      deal_status: payout.cyclops_deal_id ? (dealStatuses[payout.cyclops_deal_id] || '—') : '—',
      created_at: formatDateTime(payout.created_at),
      executed_at: formatDateTime(payout.executed_at),
    }));

    if (format === 'csv') {
      const header = [
        'Клиент',
        'Период',
        'Сумма',
        'Комиссия',
        'К выплате',
        'Статус выплаты',
        'Deal ID',
        'Статус сделки',
        'Дата создания',
        'Дата исполнения',
      ];
      const lines = [
        header.map(csvEscape).join(';'),
        ...rows.map((r) => [
          csvEscape(r.client),
          csvEscape(r.period),
          csvEscape(formatMoney(r.amount)),
          csvEscape(formatMoney(r.commission)),
          csvEscape(formatMoney(r.payout)),
          csvEscape(r.payout_status),
          csvEscape(r.deal_id),
          csvEscape(r.deal_status),
          csvEscape(r.created_at),
          csvEscape(r.executed_at),
        ].join(';')),
      ];
      const csv = `\uFEFF${lines.join('\n')}`;

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=\"client-${id}-payouts.csv\"`,
        },
      });
    }

    if (format === 'xlsx' || format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Выплаты');

      const headers = [
        'Клиент',
        'Период',
        'Сумма',
        'Комиссия',
        'К выплате',
        'Статус выплаты',
        'Deal ID',
        'Статус сделки',
        'Дата создания',
        'Дата исполнения',
      ];

      sheet.addRow([`Справка по выплатам`]);
      sheet.mergeCells(1, 1, 1, headers.length);
      sheet.getRow(1).font = { size: 14, bold: true };
      sheet.addRow([`Клиент: ${client.name}`]);
      sheet.mergeCells(2, 1, 2, headers.length);
      sheet.addRow([`Период: ${dateFrom} — ${dateTo}`]);
      sheet.mergeCells(3, 1, 3, headers.length);
      sheet.addRow([]);

      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFF6FF' },
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      rows.forEach((row) => {
        const dataRow = sheet.addRow([
          row.client,
          row.period,
          row.amount,
          row.commission,
          row.payout,
          row.payout_status,
          row.deal_id,
          row.deal_status,
          row.created_at,
          row.executed_at,
        ]);
        dataRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      sheet.columns = [
        { width: 28 },
        { width: 22 },
        { width: 12 },
        { width: 12 },
        { width: 12 },
        { width: 18 },
        { width: 18 },
        { width: 18 },
        { width: 20 },
        { width: 20 },
      ];

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename=\"client-${id}-payouts.xlsx\"`,
        },
      });
    }

    const fontPath = resolveFontPath();
    if (!fontPath) {
      return NextResponse.json(
        { error: 'Не найден шрифт для PDF. Укажите PDF_FONT_PATH или добавьте шрифт в files/fonts.' },
        { status: 500 }
      );
    }

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
    doc.registerFont('regular', fontPath);
    doc.font('regular');

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk as Buffer));

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.fontSize(16).text('Справка по выплатам', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(12).text(`Клиент: ${client.name}`);
    doc.text(`Период: ${dateFrom} — ${dateTo}`);
    doc.moveDown(0.5);

    const tableTop = doc.y + 4;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidths = [
      90,  // Клиент
      110, // Период
      60,  // Сумма
      60,  // Комиссия
      70,  // К выплате
      85,  // Статус выплаты
      85,  // Deal ID
      85,  // Статус сделки
      75,  // Создана
      75,  // Исполнена
    ];

    const columns = [
      'Клиент',
      'Период',
      'Сумма',
      'Комиссия',
      'К выплате',
      'Статус выплаты',
      'Deal ID',
      'Статус сделки',
      'Создана',
      'Исполнена',
    ];

    const availableWidth = columnWidths.reduce((sum, w) => sum + w, 0);
    const scale = pageWidth / availableWidth;
    const widths = columnWidths.map((w) => w * scale);

    let x = doc.page.margins.left;
    let y = tableTop;
    const padding = 4;

    const drawRow = (values: string[], isHeader = false) => {
      const heights = values.map((val, idx) => {
        const width = widths[idx] - padding * 2;
        return doc.heightOfString(val, { width });
      });
      const rowHeight = Math.max(...heights) + padding * 2;

      let cellX = x;
      values.forEach((val, idx) => {
        const width = widths[idx];
        if (isHeader) {
          doc.rect(cellX, y, width, rowHeight).fillAndStroke('#eef2ff', '#e5e7eb');
          doc.fillColor('#111827');
        } else {
          doc.rect(cellX, y, width, rowHeight).stroke('#e5e7eb');
          doc.fillColor('#111827');
        }
        doc.text(val, cellX + padding, y + padding, { width: width - padding * 2 });
        cellX += width;
      });
      y += rowHeight;

      if (y > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
        y = doc.page.margins.top;
        drawRow(columns, true);
      }
    };

    doc.fontSize(9);
    drawRow(columns, true);
    rows.forEach((row) => {
      drawRow([
        row.client,
        row.period,
        formatMoney(row.amount),
        formatMoney(row.commission),
        formatMoney(row.payout),
        row.payout_status,
        row.deal_id,
        row.deal_status,
        row.created_at,
        row.executed_at,
      ]);
    });

    doc.end();
    const pdfBuffer = await done;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=\"client-${id}-payouts.pdf\"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка формирования справки' },
      { status: 500 }
    );
  }
}
