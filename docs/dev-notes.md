# Dev Notes

## 2026-02-01: Upload documents for deals

### Анализ текущей реализации (п.2 ТЗ)
- UI загрузки документов бенефициара: `app/(dashboard)/beneficiaries/[beneficiary_id]/page.tsx` (валидация файла, форма, отображение статуса, refresh).
- API route для upload документа бенефициара: `app/api/cyclops/upload-document/route.ts` (formData, чтение `file.arrayBuffer()`, RSA-подпись, заголовки `sign-data`, `sign-thumbprint`, `sign-system`).
- Подпись RSA и загрузка ключей: `app/api/cyclops/upload-document/route.ts` использует `crypto.createSign('RSA-SHA256')`, ключи читаются из `KEYS_STORAGE_PATH` и расшифровываются (AES-256-GCM).
- Общий `list_documents`: `hooks/useCyclops.ts` (`listDocuments`, `getDocument`), используется в UI бенефициара для получения/обновления статуса документа.

### Основные файлы, затронутые доработкой
- `app/api/cyclops/documents/deal/upload/route.ts`
- `hooks/useCyclops.ts`
- `app/(dashboard)/deals/[dealId]/page.tsx`
- `lib/cyclops-document-utils.ts`
- `lib/cyclops-document-upload.ts`
- `tests/deal-document-upload.test.ts`
- `types/cyclops/deals.ts`
