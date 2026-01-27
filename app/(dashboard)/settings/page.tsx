'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

interface LayerStatus {
  configured: boolean;
  signSystem: string | null;
  signThumbprint: string | null;
}

type ConfigLayer = 'pre' | 'prod';

export default function SettingsPage() {
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus);

  const [keysStatus, setKeysStatus] = useState<{ pre: LayerStatus; prod: LayerStatus } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [configLayer, setConfigLayer] = useState<ConfigLayer>('pre');
  
  const [keyInputMethod, setKeyInputMethod] = useState<'text' | 'file'>('text');
  const [privateKeyText, setPrivateKeyText] = useState('');
  const [signSystem, setSignSystem] = useState('');
  const [signThumbprint, setSignThumbprint] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [keyValidation, setKeyValidation] = useState<{ valid: boolean; error?: string; thumbprint?: string } | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [testResult, setTestResult] = useState<{ layer: string; success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{ privateKey: string; publicKey: string; thumbprint: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = async () => {
    try {
      const response = await fetch('/api/keys?action=status');
      const data = await response.json();
      setKeysStatus(data);
    } catch (error) {
      console.error('Failed to load status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    if (!privateKeyText.trim()) { setKeyValidation(null); return; }
    const validateKey = async () => {
      setIsValidating(true);
      try {
        const response = await fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate-key', data: { privateKey: privateKeyText } }),
        });
        const result = await response.json();
        setKeyValidation(result);
        if (result.valid && result.thumbprint && !signThumbprint) {
          setSignThumbprint(result.thumbprint);
        }
      } catch { setKeyValidation({ valid: false, error: 'Ошибка валидации' }); }
      finally { setIsValidating(false); }
    };
    const timeout = setTimeout(validateKey, 500);
    return () => clearTimeout(timeout);
  }, [privateKeyText]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setPrivateKeyText(await file.text()); }
    catch { setSaveError('Ошибка чтения файла'); }
  };

  const handleSaveConfig = async () => {
    if (!privateKeyText || !signSystem || !signThumbprint) { setSaveError('Заполните все обязательные поля'); return; }
    setIsSaving(true); setSaveError(null); setSaveSuccess(null);
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-config', layer: configLayer, data: { privateKey: privateKeyText, signSystem, signThumbprint } }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Ошибка сохранения');
      setSaveSuccess(result.message);
      await loadStatus();
      setTimeout(() => { setShowKeyModal(false); resetForm(); }, 2000);
    } catch (error) { setSaveError(error instanceof Error ? error.message : 'Ошибка сохранения'); }
    finally { setIsSaving(false); }
  };

  const handleTestConnection = async (layer: ConfigLayer) => {
    setTestResult(null); setIsTesting(true);
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-connection', layer }),
      });
      const data = await response.json();
      setTestResult({ layer, success: data.success, message: data.success ? 'Подключение успешно!' : (data.error || 'Ошибка подключения') });
      setConnectionStatus(layer, data.success ? 'connected' : 'error');
    } catch (error) {
      setTestResult({ layer, success: false, message: error instanceof Error ? error.message : 'Ошибка подключения' });
      setConnectionStatus(layer, 'error');
    } finally { setIsTesting(false); }
  };

  const handleGenerateKeys = async () => {
    setIsGenerating(true); setGeneratedKeys(null);
    try {
      const response = await fetch('/api/keys?action=generate-keys');
      setGeneratedKeys(await response.json());
    } catch (error) { console.error('Failed to generate keys:', error); }
    finally { setIsGenerating(false); }
  };

  const handleDeleteConfig = async (layer: ConfigLayer) => {
    if (!confirm(`Удалить конфигурацию для слоя ${layer.toUpperCase()}?`)) return;
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-config', layer }),
      });
      if (response.ok) { await loadStatus(); setConnectionStatus(layer, 'unknown'); }
    } catch (error) { console.error('Failed to delete config:', error); }
  };

  const openKeyModal = (layer: ConfigLayer) => { setConfigLayer(layer); resetForm(); setShowKeyModal(true); };
  const resetForm = () => {
    setPrivateKeyText(''); setSignSystem(''); setSignThumbprint('');
    setKeyValidation(null); setSaveError(null); setSaveSuccess(null); setKeyInputMethod('text');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const renderLayerCard = (layer: ConfigLayer, label: string) => {
    const status = keysStatus?.[layer];
    const isThisLayerTesting = isTesting && testResult?.layer === layer;
    return (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`badge ${layer === 'pre' ? 'badge-warning' : 'badge-success'}`}>{layer.toUpperCase()}</span>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{label}</span>
        </div>
        <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
          {isLoading ? (
            <span className="loading"><span className="spinner" /> Загрузка...</span>
          ) : status?.configured ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Sign System:</span>
                <span style={{ fontWeight: 500 }}>{status.signSystem}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-tertiary)' }}>Thumbprint:</span>
                <span className="code">{status.signThumbprint}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--color-success)', fontSize: 13 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                Ключ настроен
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-tertiary)', fontSize: 13 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Ключ не настроен
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openKeyModal(layer)}>
            {status?.configured ? 'Изменить ключ' : 'Настроить ключ'}
          </button>
          {status?.configured && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => handleTestConnection(layer)} disabled={isTesting}>
                {isThisLayerTesting ? <span className="spinner" /> : 'Проверить'}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={() => handleDeleteConfig(layer)}>Удалить</button>
            </>
          )}
        </div>
        {testResult?.layer === layer && (
          <div style={{ padding: '10px 12px', borderRadius: 8, fontSize: 13, background: testResult.success ? 'var(--color-success-bg)' : 'var(--color-error-bg)', color: testResult.success ? 'var(--color-success)' : 'var(--color-error)' }}>
            {testResult.success ? '✓' : '✗'} {testResult.message}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <header className="page-header">
        <h1 className="page-title">Настройки</h1>
        <p className="page-description">Конфигурация подключения к Cyclops API</p>
      </header>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Ключи подписи</h2>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
          Для работы с Cyclops API необходимо настроить RSA-ключи для подписи запросов. Каждый слой (PRE/PROD) требует отдельного ключа.
        </p>
        <div className="grid grid-2">
          {renderLayerCard('pre', 'Тестовый слой')}
          {renderLayerCard('prod', 'Боевой слой')}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Генерация ключей</h2>
        <div className="card">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
            Сгенерируйте новую пару RSA-ключей. <strong>Публичный сертификат</strong> отправьте в техподдержку Точки, <strong>приватный ключ</strong> используйте для настройки выше.
          </p>
          <button className="btn btn-primary" onClick={handleGenerateKeys} disabled={isGenerating}>
            {isGenerating ? <><span className="spinner" /> Генерация...</> : 'Сгенерировать новые ключи'}
          </button>
          {generatedKeys && (
            <div style={{ marginTop: 20 }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>📤 Публичный ключ (отправить в Точку)</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(generatedKeys.publicKey)}>Копировать</button>
                </div>
                <pre className="code-block" style={{ margin: 0, borderRadius: 0 }}>{generatedKeys.publicKey}</pre>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>🔐 Приватный ключ (СОХРАНИТЬ!)</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(generatedKeys.privateKey)}>Копировать</button>
                </div>
                <pre className="code-block" style={{ margin: 0, borderRadius: 0 }}>{generatedKeys.privateKey}</pre>
              </div>
              <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                  <span>Thumbprint:</span>
                  <span className="code">{generatedKeys.thumbprint}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(generatedKeys.thumbprint)}>Копировать</button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, background: 'var(--color-warning-bg)', borderRadius: 10, fontSize: 13, color: 'var(--color-warning)', lineHeight: 1.5 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div><strong>Важно!</strong> Сохраните приватный ключ. После закрытия страницы он будет потерян.</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Настройка ключа — {configLayer.toUpperCase()}</h3>
              <button className="modal-close" onClick={() => setShowKeyModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Способ ввода приватного ключа</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['text', 'file'] as const).map((method) => (
                    <button key={method} type="button" onClick={() => setKeyInputMethod(method)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, background: keyInputMethod === method ? 'var(--accent-bg)' : 'var(--bg-secondary)', border: `2px solid ${keyInputMethod === method ? 'var(--accent-color)' : 'transparent'}`, borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500, color: keyInputMethod === method ? 'var(--accent-color)' : 'var(--text-secondary)' }}>
                      {method === 'text' ? 'Вставить текст' : 'Загрузить файл'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Приватный ключ (PEM) * {isValidating && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 'normal' }}>проверка...</span>}</label>
                {keyInputMethod === 'file' ? (
                  <div style={{ position: 'relative', padding: 32, border: '2px dashed var(--border-color)', borderRadius: 10, textAlign: 'center', cursor: 'pointer' }}>
                    <input ref={fileInputRef} type="file" accept=".pem,.key,.txt" onChange={handleFileUpload} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    <div style={{ color: 'var(--text-secondary)' }}>Выберите файл .pem или .key</div>
                  </div>
                ) : (
                  <textarea className="form-input form-textarea" placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvg...&#10;-----END PRIVATE KEY-----" value={privateKeyText} onChange={(e) => setPrivateKeyText(e.target.value)} rows={8} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                )}
                {keyValidation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: keyValidation.valid ? 'var(--color-success)' : 'var(--color-error)' }}>
                    {keyValidation.valid ? '✓ Ключ валиден' : `✗ ${keyValidation.error}`}
                    {keyValidation.thumbprint && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>(thumbprint: {keyValidation.thumbprint.slice(0, 8)}...)</span>}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Sign System (идентификатор площадки) *</label>
                <input type="text" className="form-input" placeholder="your_platform_id" value={signSystem} onChange={(e) => setSignSystem(e.target.value)} />
                <p className="form-hint">Выдаётся при регистрации площадки в Cyclops</p>
              </div>
              <div className="form-group">
                <label className="form-label">Sign Thumbprint (отпечаток ключа) *</label>
                <input type="text" className="form-input" placeholder="abc123def456..." value={signThumbprint} onChange={(e) => setSignThumbprint(e.target.value)} />
                <p className="form-hint">SHA1 отпечаток. Автозаполняется при валидации ключа</p>
              </div>
              {saveError && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'var(--color-error-bg)', color: 'var(--color-error)', borderRadius: 10, fontSize: 14 }}>✗ {saveError}</div>}
              {saveSuccess && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 10, fontSize: 14 }}>✓ {saveSuccess}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowKeyModal(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={handleSaveConfig} disabled={isSaving || !keyValidation?.valid || !signSystem || !signThumbprint}>
                {isSaving ? <><span className="spinner" /> Сохранение...</> : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
