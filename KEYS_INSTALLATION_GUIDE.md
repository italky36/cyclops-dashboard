# 🔐 Инструкция по установке публичных ключей Cyclops

## Шаг 1: Получение ключей из документации

У вас должны быть два PEM файла:
- `pre.pem` - для тестового окружения
- `prod.pem` - для продакшен окружения

Или вы можете скопировать ключи напрямую из документации Cyclops.

## Шаг 2: Извлечение содержимого ключей

### Вариант A: Из PEM файла

1. Откройте файл `pre.pem` в текстовом редакторе (Notepad, VS Code и т.д.)
2. Скопируйте **ВСЁ** содержимое, включая:
   ```
   -----BEGIN PUBLIC KEY-----
   MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIICCgKCAgEA...
   (множество строк)
   ...
   -----END PUBLIC KEY-----
   ```

### Вариант B: Из документации

Скопируйте весь блок публичного ключа из раздела "Шифрование номера карты" документации Cyclops.

## Шаг 3: Добавление в .env.local

1. Создайте файл `.env.local` в корне проекта (если его нет)

2. Добавьте переменные окружения:

```bash
# Публичный ключ для pre окружения
CYCLOPS_CARD_PUBLIC_KEY_PRE="-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIICCgKCAgEA...
(скопируйте весь ключ сюда)
...
-----END PUBLIC KEY-----"

# Публичный ключ для prod окружения
CYCLOPS_CARD_PUBLIC_KEY_PROD="-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIICCgKCAgEA...
(скопируйте весь ключ сюда)
...
-----END PUBLIC KEY-----"
```

### ⚠️ ВАЖНО: Правильное форматирование

При копировании в `.env.local`:

✅ **ПРАВИЛЬНО:**
```bash
CYCLOPS_CARD_PUBLIC_KEY_PRE="-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIICCgKCAgEAqT8rNRVd3c...
xLKZNm8D9w0t6X...
nhiJGD6fgTQxuP...
-----END PUBLIC KEY-----"
```

❌ **НЕПРАВИЛЬНО:**
```bash
# Не удаляйте переносы строк:
CYCLOPS_CARD_PUBLIC_KEY_PRE="-----BEGIN PUBLIC KEY----- MIICIjAN... -----END PUBLIC KEY-----"

# Не добавляйте лишние кавычки:
CYCLOPS_CARD_PUBLIC_KEY_PRE=""-----BEGIN PUBLIC KEY-----...""

# Не забывайте внешние кавычки:
CYCLOPS_CARD_PUBLIC_KEY_PRE=-----BEGIN PUBLIC KEY-----...
```

## Шаг 4: Альтернатива - копирование из файла через командную строку

### Windows (PowerShell):
```powershell
# Для pre
$preKey = Get-Content pre.pem -Raw
Add-Content .env.local "`nCYCLOPS_CARD_PUBLIC_KEY_PRE=`"$preKey`""

# Для prod
$prodKey = Get-Content prod.pem -Raw
Add-Content .env.local "`nCYCLOPS_CARD_PUBLIC_KEY_PROD=`"$prodKey`""
```

### Linux/Mac:
```bash
# Для pre
echo "CYCLOPS_CARD_PUBLIC_KEY_PRE=\"$(cat pre.pem)\"" >> .env.local

# Для prod
echo "CYCLOPS_CARD_PUBLIC_KEY_PROD=\"$(cat prod.pem)\"" >> .env.local
```

## Шаг 5: Проверка установки

1. Перезапустите сервер разработки:
```bash
# Остановите текущий процесс (Ctrl+C)
npm run dev
```

2. Откройте DevTools → Console

3. Попробуйте создать сделку с получением на карту

4. Проверьте запрос к `/api/encrypt-card` в Network tab:
   - Должен вернуть `200 OK`
   - Response должен содержать `card_number_crypto_base64`

## Пример правильного .env.local

```bash
# Мастер-пароль для шифрования ключей
KEYS_MASTER_PASSWORD="your-secure-password"

# Публичные ключи Cyclops для шифрования карт
CYCLOPS_CARD_PUBLIC_KEY_PRE="-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIICCgKCAgEAqT8rNRVd3cZz
fU5xLKZNm8D9w0t6XKgJm4nhiJGD6fgTQxuPvL8jQ1mN7Y2pX...
(весь ключ)
...qP6mKzFxWbJ8wQ==
-----END PUBLIC KEY-----"

CYCLOPS_CARD_PUBLIC_KEY_PROD="-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIICCgKCAgEAwR9sNVXe4dAa
hU6yMLaOn9E0x1u7YLhKn5oijKHE7ghURyvQwM9kR2oO8Z3qY...
(весь ключ)
...rQ7nLaGya9xR==
-----END PUBLIC KEY-----"

# Другие переменные окружения...
```

## Возможные проблемы и решения

### Ошибка: "Публичный ключ для слоя PRE не настроен"

**Причина:** Ключ не загружен или неправильно отформатирован

**Решение:**
1. Проверьте что в `.env.local` есть `CYCLOPS_CARD_PUBLIC_KEY_PRE`
2. Проверьте что ключ заключен в двойные кавычки
3. Проверьте что нет лишних символов или пробелов
4. Перезапустите сервер

### Ошибка: "Invalid key format"

**Причина:** Неправильный формат PEM

**Решение:**
1. Убедитесь что ключ начинается с `-----BEGIN PUBLIC KEY-----`
2. Убедитесь что ключ заканчивается на `-----END PUBLIC KEY-----`
3. Проверьте что между BEGIN и END нет пустых строк
4. Скопируйте ключ заново из оригинального файла

### Ошибка при шифровании: "data too large for key size"

**Причина:** Использован неправильный ключ (возможно приватный вместо публичного)

**Решение:**
1. Убедитесь что используете **публичный** ключ (PUBLIC KEY, не PRIVATE KEY)
2. Перепроверьте что скопировали ключ из правильного файла (pre.pem или prod.pem)

## Контакты поддержки

Если не можете найти публичные ключи в документации:
- Email: support@tochka.com
- Запросите: "Публичные RSA ключи для шифрования номеров карт (payment_contract_to_card)"
- Укажите что нужны ключи для обоих окружений: pre и prod
