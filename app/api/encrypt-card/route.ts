import { NextRequest, NextResponse } from 'next/server';
import { encryptCardNumber, CYCLOPS_CARD_PUBLIC_KEYS } from '@/lib/crypto';
import type { Layer } from '@/types/cyclops';

/**
 * POST /api/encrypt-card
 * Шифрует номер карты для передачи в Cyclops API
 *
 * Body:
 * {
 *   "card_number": "1234567890123456",
 *   "layer": "pre" | "prod" (опционально, по умолчанию используется текущий слой)
 * }
 *
 * Response:
 * {
 *   "card_number_crypto_base64": "..."
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { card_number, layer } = body as { card_number?: string; layer?: Layer };

    // Валидация номера карты
    if (!card_number) {
      return NextResponse.json(
        { error: 'Номер карты обязателен' },
        { status: 400 }
      );
    }

    // Удаляем все нецифровые символы (пробелы, дефисы и т.д.)
    const cleanCardNumber = card_number.replace(/\D/g, '');

    // Проверяем что номер карты содержит от 13 до 19 цифр (согласно документации Cyclops)
    if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
      return NextResponse.json(
        { error: 'Номер карты должен содержать от 13 до 19 цифр' },
        { status: 400 }
      );
    }

    // Определяем слой для шифрования
    const encryptionLayer: Layer = layer || (process.env.CYCLOPS_DEFAULT_LAYER as Layer) || 'pre';

    // Проверяем что слой валидный
    if (encryptionLayer !== 'pre' && encryptionLayer !== 'prod') {
      return NextResponse.json(
        { error: 'Неверный слой. Используйте "pre" или "prod"' },
        { status: 400 }
      );
    }

    // Получаем публичный ключ для шифрования
    // Приоритет: 1) Файл в .keys/card-encryption, 2) Env переменная, 3) Встроенный ключ
    let publicKey: string | null = null;

    // Пытаемся загрузить из файла
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const keysDir = process.env.KEYS_STORAGE_PATH || './.keys';
      const cardKeysDir = path.join(keysDir, 'card-encryption');
      const keyPath = path.join(cardKeysDir, `${encryptionLayer}.public.pem`);
      publicKey = await fs.readFile(keyPath, 'utf8');
    } catch {
      // Файл не найден, проверяем env переменные
      const publicKeyEnvVar = encryptionLayer === 'pre'
        ? process.env.CYCLOPS_CARD_PUBLIC_KEY_PRE
        : process.env.CYCLOPS_CARD_PUBLIC_KEY_PROD;

      publicKey = publicKeyEnvVar || CYCLOPS_CARD_PUBLIC_KEYS[encryptionLayer];
    }

    // Проверяем что ключ не является заглушкой
    if (!publicKey || publicKey.includes('...')) {
      return NextResponse.json(
        {
          error: `Публичный ключ для слоя ${encryptionLayer.toUpperCase()} не настроен. ` +
                 `Добавьте CYCLOPS_CARD_PUBLIC_KEY_${encryptionLayer.toUpperCase()} в переменные окружения.`
        },
        { status: 500 }
      );
    }

    // Шифруем номер карты
    const encrypted = encryptCardNumber(cleanCardNumber, publicKey);

    if (process.env.NODE_ENV === 'development') {
      console.info('[encrypt-card]', {
        layer: encryptionLayer,
        cardNumberMasked: `****${cleanCardNumber.slice(-4)}`,
        encryptedLength: encrypted.length,
      });
    }

    return NextResponse.json({
      card_number_crypto_base64: encrypted,
      layer: encryptionLayer,
    });

  } catch (error) {
    console.error('[encrypt-card] Ошибка шифрования:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: `Ошибка шифрования: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}
