import { NextRequest, NextResponse } from 'next/server';
import { validatePrivateKey, generateRSAKeyPair } from '@/lib/crypto';
import type { Layer } from '@/types/cyclops';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    // Проверяем наличие конфигурации для каждого слоя
    const preConfigured = Boolean(
      process.env.CYCLOPS_PRE_PRIVATE_KEY &&
      process.env.CYCLOPS_PRE_SIGN_SYSTEM &&
      process.env.CYCLOPS_PRE_SIGN_THUMBPRINT
    );

    const prodConfigured = Boolean(
      process.env.CYCLOPS_PROD_PRIVATE_KEY &&
      process.env.CYCLOPS_PROD_SIGN_SYSTEM &&
      process.env.CYCLOPS_PROD_SIGN_THUMBPRINT
    );

    return NextResponse.json({
      pre: {
        configured: preConfigured,
        signSystem: preConfigured ? '***configured***' : null,
        signThumbprint: preConfigured 
          ? process.env.CYCLOPS_PRE_SIGN_THUMBPRINT?.slice(0, 8) + '...' 
          : null,
      },
      prod: {
        configured: prodConfigured,
        signSystem: prodConfigured ? '***configured***' : null,
        signThumbprint: prodConfigured 
          ? process.env.CYCLOPS_PROD_SIGN_THUMBPRINT?.slice(0, 8) + '...' 
          : null,
      },
    });
  }

  if (action === 'generate-keys') {
    // Генерация новой пары ключей
    const { privateKey, publicKey } = generateRSAKeyPair();
    
    return NextResponse.json({
      publicKey,
      privateKeyPreview: privateKey.slice(0, 100) + '...',
      message: 'Keys generated. Save private key securely and send public key to Cyclops support.',
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, layer, data } = body as {
      action: string;
      layer?: Layer;
      data?: Record<string, string>;
    };

    if (action === 'validate-key') {
      if (!data?.privateKey) {
        return NextResponse.json(
          { error: 'Private key is required' },
          { status: 400 }
        );
      }

      const validation = validatePrivateKey(data.privateKey);
      return NextResponse.json(validation);
    }

    if (action === 'test-connection') {
      if (!layer) {
        return NextResponse.json(
          { error: 'Layer is required' },
          { status: 400 }
        );
      }

      // Пробуем выполнить echo запрос
      const { createCyclopsClient } = await import('@/lib/cyclops-client');
      
      try {
        const client = createCyclopsClient(layer);
        const result = await client.echo('test-' + Date.now());
        
        return NextResponse.json({
          success: true,
          layer,
          response: result,
        });
      } catch (error) {
        return NextResponse.json({
          success: false,
          layer,
          error: error instanceof Error ? error.message : 'Connection failed',
        });
      }
    }

    if (action === 'save-config') {
      // В production это должно сохраняться в secure storage
      // Здесь просто показываем структуру
      
      if (!layer || !data) {
        return NextResponse.json(
          { error: 'Layer and data are required' },
          { status: 400 }
        );
      }

      // Валидация ключа
      if (data.privateKey) {
        const validation = validatePrivateKey(data.privateKey);
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.error },
            { status: 400 }
          );
        }
      }

      // В реальном приложении здесь:
      // 1. Шифруем приватный ключ
      // 2. Сохраняем в secure vault (HashiCorp Vault, AWS Secrets Manager, etc.)
      // 3. Обновляем конфигурацию без перезапуска

      return NextResponse.json({
        success: true,
        message: `Configuration for ${layer} would be saved. In production, use environment variables or secure vault.`,
        envTemplate: {
          [`CYCLOPS_${layer.toUpperCase()}_PRIVATE_KEY`]: '***PRIVATE_KEY***',
          [`CYCLOPS_${layer.toUpperCase()}_SIGN_SYSTEM`]: data.signSystem,
          [`CYCLOPS_${layer.toUpperCase()}_SIGN_THUMBPRINT`]: data.signThumbprint,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
