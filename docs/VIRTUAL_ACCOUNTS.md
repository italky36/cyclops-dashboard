# Виртуальные счета (Cyclops)

Документация по модулю виртуальных счетов Cyclops API.

## Содержание

- [Обзор](#обзор)
- [API методы](#api-методы)
- [Кеширование](#кеширование)
- [Идемпотентность](#идемпотентность)
- [Валидация](#валидация)
- [Обработка ошибок](#обработка-ошибок)
- [UI сценарии](#ui-сценарии)
- [Примеры использования](#примеры-использования)

## Обзор

Модуль виртуальных счетов позволяет:
- Создавать виртуальные счета для бенефициаров
- Просматривать баланс и операции по счетам
- Выводить средства (refund)
- Переводить между счетами

### Типы счетов

| Тип | Описание |
|-----|----------|
| `standard` | Стандартный счёт для обычных операций |
| `for_ndfl` | Счёт для накопления НДФЛ |

## API методы

### create_virtual_account

Создание виртуального счёта для бенефициара.

```typescript
const result = await cyclops.createVirtualAccount({
  beneficiary_id: 'uuid-бенефициара',
  type: 'standard', // или 'for_ndfl'
});
```

### get_virtual_account

Получение информации о счёте.

```typescript
const result = await cyclops.getVirtualAccount('uuid-счёта');
// result.result.virtual_account: { code, cash, blocked_cash, beneficiary_id, type }
```

**Ограничение:** Не чаще 1 запроса в 5 минут по одному счёту.

### list_virtual_account

Получение списка счетов с фильтрами.

```typescript
const result = await cyclops.listVirtualAccounts({
  page: 1,
  per_page: 100,
  filters: {
    beneficiary: {
      id: 'uuid',
      is_active: true,
      legal_type: 'J', // F - физлицо, I - ИП, J - юрлицо
      inn: '7707083893',
    },
  },
});
```

**Ограничение:** Не чаще 1 запроса в 5 минут с одинаковыми параметрами.

### list_virtual_transaction

Получение операций по счёту.

```typescript
const result = await cyclops.listVirtualTransactions({
  page: 1,
  per_page: 100,
  filters: {
    virtual_account: 'uuid-счёта',
    deal_id: 'uuid-сделки',
    payment_id: 'uuid-платежа',
    created_date_from: '2024-01-01',
    created_date_to: '2024-12-31',
    incoming: true, // только поступления
    operation_type: 'cash_add',
    include_block_operations: false,
  },
});
// result.result: { virtual_transactions, total_payouts, count_payouts, total_receipts, count_receipts }
```

**Типы операций:**
- `cash_add` — пополнение
- `block_add` — блокировка
- `block_add_from_cash` — блокировка из доступных средств
- `cash_add_from_block` — разблокировка
- `block_write_off` — списание блокировки
- `cash_write_off` — списание

### refund_virtual_account

Вывод средств с виртуального счёта (только для `standard`).

```typescript
const result = await cyclops.refundVirtualAccount({
  virtual_account: 'uuid-счёта',
  recipient: {
    amount: 1000.00,
    account: '40702810000000000001', // 20 цифр
    bank_code: '044525225', // БИК, 9 цифр
    name: 'ООО Получатель',
    inn: '7707083893', // опционально для физлиц
    kpp: '770701001', // опционально
    document_number: '123456', // до 6 символов
  },
  purpose: 'Оплата по договору №123', // до 210 символов
  ext_key: 'uuid', // опционально, для идемпотентности
  identifier: 'ID-123', // 1-60 символов
});
// result.result.payment_id
```

### transfer_between_virtual_accounts (v1)

Простой перевод между счетами (в рамках одного номинального счёта).

```typescript
const result = await cyclops.transferBetweenVirtualAccounts({
  from_virtual_account: 'uuid-откуда',
  to_virtual_account: 'uuid-куда',
  amount: 500.00,
});
// result.result: { success, transfer_id }
```

### transfer_between_virtual_accounts_v2

Перевод с отслеживанием статуса и идемпотентностью.

```typescript
const result = await cyclops.transferBetweenVirtualAccountsV2({
  from_virtual_account: 'uuid-откуда',
  to_virtual_account: 'uuid-куда',
  amount: 500.00,
  purpose: 'Перевод средств',
  ext_key: 'uuid', // опционально
});
// result.result: { transfer_id, status: 'PROCESSING' | 'SUCCESS' | 'CANCELED' }
```

### get_virtual_accounts_transfer

Проверка статуса перевода (v2).

```typescript
const result = await cyclops.getVirtualAccountsTransfer('transfer_id');
// result.result: { id, status, amount, from_virtual_account, to_virtual_account, payment_id? }
```

## Кеширование

### Ограничения Cyclops

Cyclops ограничивает частоту запросов для методов чтения — **не чаще 1 раза в 5 минут** с одинаковыми параметрами:

- `list_virtual_account`
- `get_virtual_account`
- `list_virtual_transaction`

### Реализация кеша

Кеширование реализовано на двух уровнях:

1. **Серверный кеш** (`lib/cyclops-cache.ts`) — в памяти API route
2. **Клиентский кеш** (`hooks/useCyclops.ts`) — в памяти браузера

Оба кеша имеют TTL 5 минут. При мутациях (создание счёта, перевод, вывод) связанный кеш автоматически инвалидируется.

### Индикация в UI

В интерфейсе отображается бейдж "кеш", если данные получены из кеша.

### API информации о кеше

Ответы API содержат поле `_cache`:

```json
{
  "result": { ... },
  "_cache": {
    "cached": true,
    "cachedAt": "2024-01-15T10:00:00.000Z",
    "expiresAt": "2024-01-15T10:05:00.000Z",
    "remainingMs": 240000
  }
}
```

## Идемпотентность

### Механизм ext_key

Для методов `refund_virtual_account` и `transfer_between_virtual_accounts_v2` поддерживается идемпотентность через параметр `ext_key` (UUID).

Если передать тот же `ext_key`, Cyclops вернёт результат исходного запроса вместо повторного выполнения.

### Автоматическая генерация

При использовании `useCyclops` hook, `ext_key` генерируется автоматически:

```typescript
// ext_key генерируется на основе параметров операции
const result = await cyclops.refundVirtualAccount({
  virtual_account: 'uuid',
  recipient: { ... },
});
// ext_key сохраняется до успешного завершения
```

### Ошибка 4909

При ошибке `4909` (запрос с таким ext_key уже обрабатывается):
- В UI отображается сообщение "Запрос обрабатывается"
- Пользователю предлагается подождать или проверить историю операций

## Валидация

Валидация параметров реализована с помощью Zod (`lib/cyclops-validators.ts`).

### Форматы полей

| Поле | Формат | Пример |
|------|--------|--------|
| `amount` | float, max 2 знака | `1000.50` |
| `account` | 20 цифр | `40702810000000000001` |
| `bank_code` | 9 цифр (БИК) | `044525225` |
| `inn` | 10 или 12 цифр | `7707083893` |
| `kpp` | 9 цифр | `770701001` |
| `document_number` | до 6 символов | `123456` |
| `purpose` | до 210 символов | текст |
| `identifier` | 1-60 символов | `ID-123` |
| `virtual_account` | UUID | `550e8400-...` |
| `date` | YYYY-MM-DD | `2024-01-15` |

### ИНН опционален для счетов физлиц

ИНН не требуется для счетов, начинающихся на:
- `40817` — текущие счета физлиц
- `423` — депозиты физлиц
- `40820` — спецсчета физлиц
- `40803` — расчёты физлиц
- `40813` — расчёты резидентов-физлиц
- `426` — депозиты до востребования физлиц

## Обработка ошибок

### Коды ошибок Cyclops

| Код | Сообщение | Подсказка |
|-----|-----------|-----------|
| `4409` | Бенефициар не найден | Проверьте ID или создайте нового |
| `4410` | Бенефициар не активен | Активируйте бенефициара |
| `4411` | Виртуальный счёт не найден | Проверьте номер счёта |
| `4415` | Недостаточно средств | Пополните счёт |
| `4406` | Документ не найден | — |
| `4451` | Некорректные коды VO | Проверьте коды валютных операций |
| `4558` | Наложены ограничения | Свяжитесь с банком |
| `4909` | Запрос обрабатывается | Дождитесь завершения |
| `4905` | Перевод не найден | — |

### Маппинг в UI

Ошибки автоматически преобразуются в человекочитаемые сообщения (`lib/cyclops-errors.ts`) и отображаются в toast-уведомлениях.

### Логирование

Все запросы логируются с маскированием чувствительных данных:
- `account` → `****0001`
- `bank_code` → `****5225`
- `inn` → `77****93`

Полностью логируются: `ext_key`, `transfer_id`, `payment_id`.

## UI сценарии

### Страница виртуальных счетов (`/virtual-accounts`)

**Вкладка "Счета":**
- Фильтры по ИНН, типу бенефициара, статусу
- Карточки счетов с балансами
- Кнопки: Детали, Операции, Вывод

**Вкладка "Операции":**
- Выбор счёта
- Фильтры по датам
- Тогл "Включить блокировки"
- Итоги: поступления/списания

**Модальные окна:**
- Создание счёта (выбор бенефициара, тип)
- Перевод между счетами (v1/v2)
- Вывод средств (реквизиты получателя)
- Детали счёта

## Примеры использования

### React компонент

```tsx
import { useCyclops } from '@/hooks/useCyclops';
import { useAppStore } from '@/lib/store';

function MyComponent() {
  const layer = useAppStore((s) => s.layer);
  const cyclops = useCyclops({ layer });

  const handleRefund = async () => {
    try {
      const result = await cyclops.refundVirtualAccount({
        virtual_account: accountId,
        recipient: {
          amount: 1000,
          account: '40702810000000000001',
          bank_code: '044525225',
          name: 'ООО Компания',
          inn: '7707083893',
        },
        purpose: 'Возврат средств',
      });
      console.log('Payment ID:', result.result?.payment_id);
    } catch (error) {
      // Ошибка уже обработана и показана в toast
      console.error(error);
    }
  };

  return (
    <div>
      {cyclops.loading && <Spinner />}
      {cyclops.cacheInfo?.cached && <CacheBadge />}
      {cyclops.error && <ErrorMessage message={cyclops.error} />}
    </div>
  );
}
```

### Проверка статуса перевода

```tsx
const [transferId, setTransferId] = useState<string | null>(null);
const [status, setStatus] = useState<string | null>(null);

const checkStatus = async () => {
  if (!transferId) return;
  const result = await cyclops.getVirtualAccountsTransfer(transferId);
  setStatus(result.result?.status || 'UNKNOWN');
};

// Автоматический polling
useEffect(() => {
  if (status === 'PROCESSING') {
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }
}, [status]);
```

## Тестирование

### Запуск тестов

```bash
# Валидаторы
npx tsx tests/cyclops-validators.test.ts

# Обработка ошибок
npx tsx tests/cyclops-errors.test.ts

# Кеширование
npx tsx tests/cyclops-cache.test.ts
```

### Тестирование с моками

Для интеграционных тестов используйте мок-сервер:

```typescript
// __mocks__/cyclops.ts
export const mockCyclopsResponse = (method: string, result: unknown) => {
  // Реализация мока
};
```

## Безопасность

- Приватные ключи хранятся зашифрованными (AES-256-GCM)
- Банковские реквизиты маскируются в логах
- ext_key можно логировать полностью
- Валидация всех входных данных
