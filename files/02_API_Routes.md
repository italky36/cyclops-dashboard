# Задание 2: API Routes для сделок

## Контекст
Проект Cyclops Dashboard (Next.js 14 App Router). Типы и валидаторы уже созданы в предыдущем задании. Нужно реализовать серверные API-маршруты для работы со сделками.

## Входные данные
- Типы: `types/cyclops/deals.ts`
- Валидаторы: `lib/validators/deals.ts`
- Существующий Cyclops-клиент: `lib/cyclops/client.ts`
- Пример реализации: `app/api/payments/`

## Задача
Создать API routes для всех операций со сделками.

## Методы Cyclops API

| Метод | JSON-RPC | Описание |
|-------|----------|----------|
| Список сделок | `list_deals` | Фильтры, пагинация |
| Детали сделки | `get_deal` | По deal_id |
| Создание | `create_deal` | Плательщики + получатели |
| Обновление | `update_deal` | Изменение данных |
| Исполнение | `execute_deal` | Запуск оплаты |
| Отмена (new) | `rejected_deal` | Только статус new |
| Отмена (correction) | `cancel_deal_with_executed_recipients` | Только статус correction |
| Проверка комплаенс | `compliance_check_deal` | Проверка платежей |

## Структура файлов

```
app/api/deals/
├── route.ts                      # GET (список), POST (создание)
├── [dealId]/
│   ├── route.ts                  # GET (детали), PUT (обновление), DELETE (отмена)
│   ├── execute/
│   │   └── route.ts              # POST (исполнение)
│   ├── cancel/
│   │   └── route.ts              # POST (отмена из коррекции)
│   └── compliance/
│       └── route.ts              # POST (проверка)
```

## Реализация

### 1. `app/api/deals/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callCyclops } from '@/lib/cyclops/client';
import { listDealsParamsSchema, createDealParamsSchema } from '@/lib/validators/deals';
import type { ListDealsParams, CreateDealParams } from '@/types/cyclops/deals';

// GET /api/deals — список сделок
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: ListDealsParams = {
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      per_page: searchParams.get('per_page') ? Number(searchParams.get('per_page')) : 50,
      field_names: ['status', 'amount', 'created_at', 'updated_at', 'ext_key'],
      filters: {},
    };

    // Собираем фильтры
    const status = searchParams.get('status');
    const ext_key = searchParams.get('ext_key');
    const created_date_from = searchParams.get('created_date_from');
    const created_date_to = searchParams.get('created_date_to');
    const updated_at_from = searchParams.get('updated_at_from');
    const updated_at_to = searchParams.get('updated_at_to');

    if (status) params.filters!.status = status as any;
    if (ext_key) params.filters!.ext_key = ext_key;
    if (created_date_from) params.filters!.created_date_from = created_date_from;
    if (created_date_to) params.filters!.created_date_to = created_date_to;
    if (updated_at_from) params.filters!.updated_at_from = updated_at_from;
    if (updated_at_to) params.filters!.updated_at_to = updated_at_to;

    // Удаляем пустой объект filters
    if (Object.keys(params.filters!).length === 0) {
      delete params.filters;
    }

    const validated = listDealsParamsSchema.parse(params);
    const result = await callCyclops('list_deals', validated);
    
    return NextResponse.json(result);
  } catch (error) {
    // Обработка ошибок (см. lib/cyclops/errors.ts)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка загрузки сделок' },
      { status: 500 }
    );
  }
}

// POST /api/deals — создание сделки
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createDealParamsSchema.parse(body);
    
    const result = await callCyclops('create_deal', validated);
    
    // Логирование в audit_log
    // await logAudit('deal_created', { deal_id: result.deal_id, ...body });
    
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Ошибка валидации', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка создания сделки' },
      { status: 500 }
    );
  }
}
```

### 2. `app/api/deals/[dealId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callCyclops } from '@/lib/cyclops/client';
import { updateDealParamsSchema } from '@/lib/validators/deals';

interface RouteParams {
  params: { dealId: string };
}

// GET /api/deals/[dealId] — детали сделки
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await callCyclops('get_deal', { deal_id: params.dealId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Сделка не найдена' },
      { status: error.message?.includes('4417') ? 404 : 500 }
    );
  }
}

// PUT /api/deals/[dealId] — обновление сделки
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    
    const updateParams = {
      deal_id: params.dealId,
      deal_data: body,
    };
    
    const validated = updateDealParamsSchema.parse(updateParams);
    const result = await callCyclops('update_deal', validated);
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка обновления' },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[dealId] — отмена сделки (статус new)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await callCyclops('rejected_deal', { deal_id: params.dealId });
    return NextResponse.json(result);
  } catch (error) {
    // Код 4418 = "Операция невозможна с текущим статусом"
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка отмены' },
      { status: 400 }
    );
  }
}
```

### 3. `app/api/deals/[dealId]/execute/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callCyclops } from '@/lib/cyclops/client';

interface RouteParams {
  params: { dealId: string };
}

// POST /api/deals/[dealId]/execute — исполнение сделки
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const executeParams: any = { deal_id: params.dealId };
    
    // Частичное исполнение — если указаны конкретные получатели
    if (body.recipients_execute && Array.isArray(body.recipients_execute)) {
      executeParams.recipients_execute = body.recipients_execute;
    }
    
    const result = await callCyclops('execute_deal', executeParams);
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка исполнения' },
      { status: 500 }
    );
  }
}
```

### 4. `app/api/deals/[dealId]/cancel/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callCyclops } from '@/lib/cyclops/client';

interface RouteParams {
  params: { dealId: string };
}

// POST /api/deals/[dealId]/cancel — отмена из коррекции
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await callCyclops('cancel_deal_with_executed_recipients', {
      deal_id: params.dealId,
    });
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка отмены' },
      { status: 500 }
    );
  }
}
```

### 5. `app/api/deals/[dealId]/compliance/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { callCyclops } from '@/lib/cyclops/client';

interface RouteParams {
  params: { dealId: string };
}

// POST /api/deals/[dealId]/compliance — проверка комплаенс
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const result = await callCyclops('compliance_check_deal', {
      deal_id: params.dealId,
    });
    
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ошибка проверки' },
      { status: 500 }
    );
  }
}
```

## Белый список методов

Добавить в `lib/cyclops/allowedMethods.ts`:

```typescript
export const ALLOWED_METHODS = [
  // ... существующие методы
  'create_deal',
  'update_deal',
  'list_deals',
  'get_deal',
  'execute_deal',
  'rejected_deal',
  'cancel_deal_with_executed_recipients',
  'compliance_check_deal',
];
```

## Обработка ошибок

Добавить в `lib/cyclops/errors.ts`:

```typescript
export const DEAL_ERROR_MESSAGES: Record<number, string> = {
  4406: 'Документ не найден',
  4407: 'Ошибка загрузки документа',
  4408: 'Документ ещё не загружен',
  4410: 'Бенефициар не активен',
  4411: 'Виртуальный счёт не найден',
  4415: 'Недостаточно средств на виртуальном счёте',
  4417: 'Сделка не найдена',
  4418: 'Операция невозможна с текущим статусом сделки',
  4419: 'Нельзя изменить получателя',
  4428: 'СБП-банк не найден по ID',
  4436: 'Ошибка запроса комплаенс-службы',
  4437: 'Комплаенс ввёл ограничение на b2c переводы',
  4442: 'Сделка с таким внешним ключом уже существует',
  4447: 'Платёж получателю уже выполняется или исполнен',
  4448: 'В сделке нет получателей с указанными номерами',
  4451: 'Назначение платежа нерезиденту не содержит код ВО',
  4556: 'Виртуальный счёт не связан с номинальным счётом плательщика',
  4557: 'Виртуальные счета должны быть связаны только с одним номинальным счётом',
  4558: 'Операция невозможна из-за ограничений по исполнительному производству',
  4947: 'Тип платежа не разрешён для системы',
  4004: 'Ошибка: возвращено более одного объекта',
};
```

## Кэширование

Методы `list_deals` и `get_deal` имеют rate-limit (1 запрос / 5 мин с одинаковыми параметрами).

Использовать существующий механизм кэширования:

```typescript
// В lib/cyclops/cache.ts добавить:
const CACHED_METHODS = ['list_deals', 'get_deal'];
const CACHE_TTL = 5 * 60 * 1000; // 5 минут
```

## Ожидаемый результат

Созданные файлы:
- `app/api/deals/route.ts`
- `app/api/deals/[dealId]/route.ts`
- `app/api/deals/[dealId]/execute/route.ts`
- `app/api/deals/[dealId]/cancel/route.ts`
- `app/api/deals/[dealId]/compliance/route.ts`

Обновлённые файлы:
- `lib/cyclops/allowedMethods.ts` — добавлены методы deals
- `lib/cyclops/errors.ts` — добавлены коды ошибок deals

## Проверка

После реализации проверить через curl или Postman:

```bash
# Список сделок
curl http://localhost:3000/api/deals?status=new&per_page=10

# Детали сделки
curl http://localhost:3000/api/deals/141afb3e-b7d7-492c-9f65-5eeafcf1a351

# Создание (POST с JSON body)
# Исполнение (POST)
# Отмена (DELETE)
```
