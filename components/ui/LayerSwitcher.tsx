'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import type { Layer } from '@/types/cyclops';

export function LayerSwitcher() {
  const layer = useAppStore((s) => s.layer);
  const setLayer = useAppStore((s) => s.setLayer);
  const connectionStatus = useAppStore((s) => s.connectionStatus);
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus);
  const hasInitialized = useRef(false);

  const handleChange = (newLayer: Layer) => {
    if (newLayer !== layer) {
      setLayer(newLayer);
    }
  };

  useEffect(() => {
    let isActive = true;

    const checkConnection = async () => {
      try {
        const statusResponse = await fetch('/api/keys?action=status');
        const statusData = await statusResponse.json();
        const layers: Layer[] = ['pre', 'prod'];

        await Promise.all(
          layers.map(async (targetLayer) => {
            if (!statusData?.[targetLayer]?.configured) {
              if (isActive) {
                setConnectionStatus(targetLayer, 'unknown');
              }
              return;
            }

            try {
              const response = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test-connection', layer: targetLayer }),
              });
              const data = await response.json();
              if (isActive) {
                setConnectionStatus(targetLayer, data.success ? 'connected' : 'error');
              }
            } catch {
              if (isActive) {
                setConnectionStatus(targetLayer, 'error');
              }
            }
          })
        );
      } catch {
        if (!isActive) return;
        if (!hasInitialized.current) {
          setConnectionStatus('pre', 'unknown');
          setConnectionStatus('prod', 'unknown');
        }
      } finally {
        hasInitialized.current = true;
      }
    };

    checkConnection();
    const intervalId = window.setInterval(checkConnection, 5 * 60 * 1000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [setConnectionStatus]);

  return (
    <div className="layer-switcher">
      <div className="layer-options">
        <button
          className={`layer-option ${layer === 'pre' ? 'active' : ''}`}
          onClick={() => handleChange('pre')}
        >
          <span className="layer-label">PRE</span>
          <span className="layer-desc">Тестовый</span>
          <span className={`status-dot ${connectionStatus.pre}`} />
        </button>
        
        <button
          className={`layer-option ${layer === 'prod' ? 'active' : ''}`}
          onClick={() => handleChange('prod')}
        >
          <span className="layer-label">PROD</span>
          <span className="layer-desc">Боевой</span>
          <span className={`status-dot ${connectionStatus.prod}`} />
        </button>
      </div>

      {layer === 'prod' && (
        <div className="prod-warning">
          ⚠️ Вы работаете с боевым окружением
        </div>
      )}

      <style jsx>{`
        .layer-switcher {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .layer-options {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: var(--bg-secondary);
          border-radius: 12px;
        }

        .layer-option {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 12px 16px;
          border: none;
          border-radius: 10px;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .layer-option:hover {
          background: var(--bg-hover);
        }

        .layer-option.active {
          background: var(--bg-primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .layer-label {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: 0.5px;
        }

        .layer-desc {
          font-size: 11px;
          color: var(--text-secondary);
        }

        .status-dot {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-neutral);
        }

        .status-dot.connected {
          background: var(--color-success);
          box-shadow: 0 0 6px var(--color-success);
        }

        .status-dot.error {
          background: var(--color-error);
        }

        .prod-warning {
          padding: 8px 12px;
          background: rgba(255, 152, 0, 0.1);
          border: 1px solid rgba(255, 152, 0, 0.3);
          border-radius: 8px;
          font-size: 12px;
          color: #ff9800;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
