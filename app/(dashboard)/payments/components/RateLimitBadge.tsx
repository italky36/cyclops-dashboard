'use client';

import { useState, useEffect } from 'react';

interface RateLimitBadgeProps {
  nextAllowedAt?: string;
  cached?: boolean;
  cacheAgeSeconds?: number;
  compact?: boolean;
}

export function RateLimitBadge({
  nextAllowedAt,
  cached,
  cacheAgeSeconds,
  compact = false,
}: RateLimitBadgeProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!nextAllowedAt) {
      if (typeof cacheAgeSeconds === 'number') {
        const ttlSeconds = 300;
        const baseRemaining = Math.max(0, ttlSeconds - cacheAgeSeconds);
        const startTime = Date.now();
        const tick = () => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          const remaining = Math.max(0, baseRemaining - elapsed);
          setRemainingSeconds(remaining > 0 ? remaining : null);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
      }
      setRemainingSeconds(null);
      return;
    }

    const updateRemaining = () => {
      const target = new Date(nextAllowedAt).getTime();
      const diff = target - Date.now();
      setRemainingSeconds(diff > 0 ? Math.ceil(diff / 1000) : null);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [nextAllowedAt, cacheAgeSeconds]);

  if (!cached && !remainingSeconds) {
    return null;
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <span
        className="rate-limit-badge compact"
        title={`Данные из кэша. Обновление через ${remainingSeconds ? formatTime(remainingSeconds) : '—'}`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        {remainingSeconds ? formatTime(remainingSeconds) : cacheAgeSeconds ? `${cacheAgeSeconds}s` : '—'}

        <style jsx>{`
          .rate-limit-badge.compact {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 8px;
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            border-radius: 4px;
            font-size: 12px;
            font-family: monospace;
          }
        `}</style>
      </span>
    );
  }

  return (
    <div className="rate-limit-badge">
      <div className="badge-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div className="badge-content">
        <span className="badge-label">Данные из кэша</span>
        {remainingSeconds ? (
          <span className="badge-timer">Обновление через {formatTime(remainingSeconds)}</span>
        ) : cacheAgeSeconds ? (
          <span className="badge-age">Получены {cacheAgeSeconds} сек. назад</span>
        ) : null}
      </div>

      <style jsx>{`
        .rate-limit-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--bg-tertiary);
          border-radius: 8px;
          font-size: 13px;
        }

        .badge-icon {
          color: var(--text-secondary);
        }

        .badge-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .badge-label {
          font-weight: 500;
          color: var(--text-primary);
        }

        .badge-timer {
          font-family: monospace;
          color: var(--color-warning);
        }

        .badge-age {
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}

interface RefreshButtonProps {
  onClick: () => void;
  isLoading: boolean;
  nextAllowedAt?: string;
  cached?: boolean;
}

export function RefreshButton({
  onClick,
  isLoading,
  nextAllowedAt,
  cached,
}: RefreshButtonProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!nextAllowedAt) {
      setRemainingSeconds(null);
      return;
    }

    const updateRemaining = () => {
      const target = new Date(nextAllowedAt).getTime();
      const diff = target - Date.now();
      setRemainingSeconds(diff > 0 ? Math.ceil(diff / 1000) : null);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [nextAllowedAt]);

  const isDisabled = isLoading || (cached && remainingSeconds !== null && remainingSeconds > 0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <button
      className={`refresh-button ${isDisabled ? 'disabled' : ''}`}
      onClick={onClick}
      disabled={isDisabled}
      title={remainingSeconds ? `Доступно через ${formatTime(remainingSeconds)}` : 'Обновить'}
    >
      {isLoading ? (
        <span className="spinner" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      )}
      <span className="button-text">
        {isLoading ? 'Обновление...' : remainingSeconds ? formatTime(remainingSeconds) : 'Обновить'}
      </span>

      <style jsx>{`
        .refresh-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-button:hover:not(.disabled) {
          background: var(--bg-tertiary);
          border-color: var(--text-secondary);
        }

        .refresh-button.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .button-text {
          font-family: inherit;
        }

        .refresh-button.disabled .button-text {
          font-family: monospace;
          color: var(--text-secondary);
        }
      `}</style>
    </button>
  );
}
