import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Директория для хранения зашифрованных ключей
const KEYS_DIR = process.env.KEYS_STORAGE_PATH || './.keys';

// Алгоритм шифрования
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 64;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// Мастер-пароль из переменных окружения (обязательно установить в production!)
const getMasterPassword = () => {
  const password = process.env.KEYS_MASTER_PASSWORD;
  if (!password) {
    // В development используем дефолтный (НЕ для production!)
    if (process.env.NODE_ENV === 'development') {
      return 'dev-password-change-in-production';
    }
    throw new Error('KEYS_MASTER_PASSWORD environment variable is required');
  }
  return password;
};

async function fetchPublicIp(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    const text = (await response.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Шифрование данных
 */
function encrypt(text: string, password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

/**
 * Дешифрование данных
 */
function decrypt(encryptedText: string, password: string): string {
  const buffer = Buffer.from(encryptedText, 'base64');
  
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Валидация приватного ключа RSA
 */
function validatePrivateKey(pem: string): { valid: boolean; error?: string; thumbprint?: string } {
  try {
    // Проверяем что это валидный PEM
    if (!pem.includes('-----BEGIN') || !pem.includes('-----END')) {
      return { valid: false, error: 'Неверный формат ключа. Ожидается PEM формат.' };
    }

    const keyObject = crypto.createPrivateKey(pem);
    
    if (keyObject.asymmetricKeyType !== 'rsa') {
      return { valid: false, error: 'Ключ должен быть типа RSA' };
    }
    
    const keyDetails = keyObject.asymmetricKeyDetails;
    if (keyDetails?.modulusLength && keyDetails.modulusLength < 2048) {
      return { valid: false, error: 'Ключ должен быть минимум 2048 бит' };
    }

    // Вычисляем thumbprint из публичного ключа
    const publicKey = crypto.createPublicKey(keyObject);
    const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
    const thumbprint = crypto.createHash('sha1').update(publicKeyDer).digest('hex');
    
    return { valid: true, thumbprint };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Неверный формат ключа' 
    };
  }
}

/**
 * Валидация публичного сертификата
 */
function validateCertificate(pem: string): { valid: boolean; error?: string; thumbprint?: string; subject?: string } {
  try {
    if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
      return { valid: false, error: 'Неверный формат сертификата. Ожидается PEM формат.' };
    }

    const cert = new crypto.X509Certificate(pem);
    const thumbprint = cert.fingerprint.replace(/:/g, '').toLowerCase();
    
    return { 
      valid: true, 
      thumbprint,
      subject: cert.subject
    };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Неверный формат сертификата' 
    };
  }
}

/**
 * Получение пути к файлу ключей для слоя
 */
function getKeysFilePath(layer: string): string {
  return path.join(KEYS_DIR, `${layer}.keys.enc`);
}

/**
 * Сохранение конфигурации ключей
 */
async function saveKeysConfig(layer: string, config: {
  privateKey: string;
  signSystem: string;
  signThumbprint: string;
}): Promise<void> {
  const password = getMasterPassword();
  
  // Создаём директорию если не существует
  await fs.mkdir(KEYS_DIR, { recursive: true });
  
  // Шифруем и сохраняем
  const encrypted = encrypt(JSON.stringify(config), password);
  await fs.writeFile(getKeysFilePath(layer), encrypted, 'utf8');
}

/**
 * Загрузка конфигурации ключей
 */
async function loadKeysConfig(layer: string): Promise<{
  privateKey: string;
  signSystem: string;
  signThumbprint: string;
} | null> {
  const password = getMasterPassword();
  
  try {
    const encrypted = await fs.readFile(getKeysFilePath(layer), 'utf8');
    const decrypted = decrypt(encrypted, password);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

/**
 * Проверка наличия конфигурации
 */
async function hasKeysConfig(layer: string): Promise<boolean> {
  try {
    await fs.access(getKeysFilePath(layer));
    return true;
  } catch {
    return false;
  }
}

// GET - получение статуса ключей
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const layer = searchParams.get('layer');

  try {
    if (action === 'status') {
      // Проверяем статус для обоих слоёв
      const [preConfigured, prodConfigured] = await Promise.all([
        hasKeysConfig('pre'),
        hasKeysConfig('prod'),
      ]);

      // Пытаемся загрузить конфигурацию для получения thumbprint
      const [preConfig, prodConfig] = await Promise.all([
        preConfigured ? loadKeysConfig('pre') : null,
        prodConfigured ? loadKeysConfig('prod') : null,
      ]);

      return NextResponse.json({
        pre: {
          configured: preConfigured,
          signSystem: preConfig?.signSystem || null,
          signThumbprint: preConfig?.signThumbprint 
            ? preConfig.signThumbprint.slice(0, 8) + '...' 
            : null,
        },
        prod: {
          configured: prodConfigured,
          signSystem: prodConfig?.signSystem || null,
          signThumbprint: prodConfig?.signThumbprint 
            ? prodConfig.signThumbprint.slice(0, 8) + '...' 
            : null,
        },
      });
    }

    if (action === 'generate-keys') {
      // Генерация новой пары RSA ключей
      const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      });

      // Вычисляем thumbprint
      const pubKeyObj = crypto.createPublicKey(publicKey);
      const pubKeyDer = pubKeyObj.export({ type: 'spki', format: 'der' });
      const thumbprint = crypto.createHash('sha1').update(pubKeyDer).digest('hex');

      return NextResponse.json({
        privateKey,
        publicKey,
        thumbprint,
        message: 'Ключи сгенерированы. Сохраните приватный ключ и отправьте публичный (сертификат) в техподдержку Cyclops.',
      });
    }

    if (action === 'get-config' && layer) {
      // Получение конфигурации (без приватного ключа!)
      const config = await loadKeysConfig(layer);
      if (!config) {
        return NextResponse.json({ configured: false });
      }

      return NextResponse.json({
        configured: true,
        signSystem: config.signSystem,
        signThumbprint: config.signThumbprint,
        // Приватный ключ НЕ возвращаем в браузер!
        privateKeyPreview: '***настроен***',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Keys API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - сохранение/валидация ключей
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, layer, data } = body as {
      action: string;
      layer?: string;
      data?: {
        privateKey?: string;
        privateKeyPath?: string;
        signSystem?: string;
        signThumbprint?: string;
        certificate?: string;
      };
    };

    if (action === 'validate-key') {
      if (!data?.privateKey) {
        return NextResponse.json(
          { error: 'Приватный ключ обязателен' },
          { status: 400 }
        );
      }

      const validation = validatePrivateKey(data.privateKey);
      return NextResponse.json(validation);
    }

    if (action === 'validate-certificate') {
      if (!data?.certificate) {
        return NextResponse.json(
          { error: 'Сертификат обязателен' },
          { status: 400 }
        );
      }

      const validation = validateCertificate(data.certificate);
      return NextResponse.json(validation);
    }

    if (action === 'save-config') {
      if (!layer || !['pre', 'prod'].includes(layer)) {
        return NextResponse.json(
          { error: 'Неверный слой. Укажите "pre" или "prod"' },
          { status: 400 }
        );
      }

      if (!data?.privateKey || !data?.signSystem || !data?.signThumbprint) {
        return NextResponse.json(
          { error: 'Необходимо указать privateKey, signSystem и signThumbprint' },
          { status: 400 }
        );
      }

      // Валидируем ключ
      const validation = validatePrivateKey(data.privateKey);
      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.error },
          { status: 400 }
        );
      }

      // Сохраняем конфигурацию
      await saveKeysConfig(layer, {
        privateKey: data.privateKey,
        signSystem: data.signSystem,
        signThumbprint: data.signThumbprint,
      });

      return NextResponse.json({
        success: true,
        message: `Конфигурация для слоя ${layer.toUpperCase()} сохранена`,
        thumbprint: validation.thumbprint,
      });
    }

    if (action === 'test-connection') {
      if (!layer || !['pre', 'prod'].includes(layer)) {
        return NextResponse.json(
          { error: 'Неверный слой' },
          { status: 400 }
        );
      }

      const config = await loadKeysConfig(layer);
      if (!config) {
        return NextResponse.json({
          success: false,
          error: `Конфигурация для слоя ${layer.toUpperCase()} не найдена`,
        });
      }

      if (process.env.NODE_ENV === 'development') {
        const [ipv4, ipv6] = await Promise.all([
          fetchPublicIp('https://api.ipify.org'),
          fetchPublicIp('https://api64.ipify.org'),
        ]);
        console.info('[Keys] test-connection', {
          layer,
          signSystem: config.signSystem,
          signThumbprint: config.signThumbprint,
          keysFile: getKeysFilePath(layer),
          publicIp: { ipv4, ipv6 },
        });
      }

      // Динамический импорт клиента
      const { CyclopsClient } = await import('@/lib/cyclops-client');
      
      try {
        const client = new CyclopsClient({
          layer: layer as 'pre' | 'prod',
          privateKey: config.privateKey,
          signSystem: config.signSystem,
          signThumbprint: config.signThumbprint,
        });

        const result = await client.echo(`test-${Date.now()}`);
        
        return NextResponse.json({
          success: !result.error,
          layer,
          response: result,
          error: result.error?.message,
        });
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[Keys] test-connection failed', {
            layer,
            error: error instanceof Error ? error.stack || error.message : String(error),
          });
        }
        return NextResponse.json({
          success: false,
          layer,
          error: error instanceof Error ? error.message : 'Ошибка подключения',
        });
      }
    }

    if (action === 'delete-config') {
      if (!layer || !['pre', 'prod'].includes(layer)) {
        return NextResponse.json(
          { error: 'Неверный слой' },
          { status: 400 }
        );
      }

      try {
        await fs.unlink(getKeysFilePath(layer));
        return NextResponse.json({
          success: true,
          message: `Конфигурация для слоя ${layer.toUpperCase()} удалена`,
        });
      } catch {
        return NextResponse.json({
          success: false,
          error: 'Конфигурация не найдена',
        });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Keys API POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
