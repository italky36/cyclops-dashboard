'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  date: string;
  payments: number;
  deals: number;
}

interface AnalyticsChartProps {
  layer: 'prod' | 'test' | 'pre';
  days?: number;
}

export function AnalyticsChart({ layer, days = 30 }: AnalyticsChartProps) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/analytics?days=${days}`);
        const result = await response.json();

        console.log('AnalyticsChart - API response:', result);

        if (result.success) {
          setData(result.data);
          console.log('AnalyticsChart - data loaded:', result.data.length, 'points');
          if (result.debug) {
            console.log('AnalyticsChart - debug info:', result.debug);
          }
        } else {
          setError(result.error || 'Ошибка загрузки данных');
        }
      } catch (err) {
        setError('Не удалось загрузить данные');
        console.error('Failed to fetch analytics:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [days, layer]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
    }).format(date);
  };

  interface TooltipPayload {
    name: string;
    value: number;
    color: string;
  }

  interface TooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className={`custom-tooltip${isMobile ? ' mobile' : ''}`}>
          <p className="tooltip-label">{formatDate(label || '')}</p>
          {payload.map((entry, index) => (
            <p
              key={`item-${index}`}
              className={`tooltip-item${isMobile ? ' compact' : ''}`}
              style={{ color: entry.color }}
            >
              <span className="tooltip-name">{entry.name}:</span>{' '}
              <span className="tooltip-value">{formatCurrency(entry.value)}</span>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Проверяем, есть ли хоть какие-то данные
  const hasData = data.some(d => d.payments > 0 || d.deals > 0);

  if (error && data.length === 0) {
    return (
      <div className="chart-container error">
        <div className="error-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>{error}</p>
        </div>
        <style jsx>{`
          .chart-container.error {
            height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .error-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            color: var(--color-error);
            text-align: center;
          }

          .error-content svg {
            opacity: 0.5;
          }

          .error-content p {
            font-size: 14px;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  // Если данных нет, показываем empty state
  if (!hasData && data.length > 0 && !isLoading) {
    return (
      <div className="chart-container empty">
        <div className="empty-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <h3>Нет данных за выбранный период</h3>
          <p>Данные о платежах и сделках появятся здесь после их создания</p>
        </div>
        <style jsx>{`
          .chart-container.empty {
            height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .empty-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            color: var(--text-secondary);
            text-align: center;
            max-width: 400px;
          }

          .empty-content svg {
            opacity: 0.3;
          }

          .empty-content h3 {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary);
            margin: 0;
          }

          .empty-content p {
            font-size: 14px;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  const showSkeleton = isLoading && data.length === 0;

  const values = data.flatMap((item) => [item.payments, item.deals]).filter((value) => value > 0);
  const maxValue = values.length ? Math.max(...values) : 0;
  const ticks = maxValue > 0 ? undefined : [0];
  const yAxisPadding = maxValue > 0 ? { top: 8 } : undefined;

  return (
    <div className="chart-container">
      {isLoading && data.length > 0 && (
        <div className="chart-overlay">
          <div className="chart-spinner" aria-label="Загрузка" />
        </div>
      )}
      {error && data.length > 0 && (
        <div className="chart-overlay error">
          <span>{error}</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorPayments" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorDeals" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="var(--text-tertiary)"
            style={{ fontSize: '12px' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value) => {
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}М`;
              if (value >= 1000) return `${(value / 1000).toFixed(0)}К`;
              return value.toString();
            }}
            stroke="var(--text-tertiary)"
            style={{ fontSize: '12px' }}
            tickLine={false}
            tickCount={4}
            domain={['auto', 'auto']}
            ticks={ticks}
            minTickGap={8}
            interval="preserveStartEnd"
            axisLine={false}
            padding={yAxisPadding}
          />
          <Tooltip
            content={<CustomTooltip />}
            wrapperStyle={{
              pointerEvents: 'none',
              maxWidth: isMobile ? 220 : undefined,
            }}
            position={isMobile ? { x: 12, y: 8 } : undefined}
          />
          <Legend
            wrapperStyle={{
              paddingTop: '6px',
              marginTop: '-6px',
              marginBottom: '-4px',
              fontSize: '13px',
            }}
            iconType="line"
          />
          <Area
            type="monotone"
            dataKey="payments"
            name="Платежи (входящие)"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#colorPayments)"
            animationDuration={900}
            animationEasing="linear"
            animationBegin={0}
          />
          <Area
            type="monotone"
            dataKey="deals"
            name="Сделки (выплаты)"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#colorDeals)"
            animationDuration={900}
            animationEasing="linear"
            animationBegin={150}
          />
        </AreaChart>
      </ResponsiveContainer>

      <style jsx>{`
        .chart-container {
          width: 100%;
          padding: 6px 0 2px;
          position: relative;
        }

        .chart-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.55);
          backdrop-filter: blur(2px);
          z-index: 2;
          font-size: 12px;
          color: var(--text-secondary);
          pointer-events: none;
        }

        .chart-overlay.error {
          background: rgba(254, 242, 242, 0.6);
          color: var(--color-error);
          font-weight: 500;
        }

        .chart-skeleton {
          position: absolute;
          inset: 0;
          display: flex;
          gap: 12px;
          align-items: flex-end;
          justify-content: center;
          padding: 16px 24px 24px;
          z-index: 1;
          pointer-events: none;
        }

        .skeleton-bar {
          flex: 0 0 auto;
          width: min(26%, 160px);
          max-width: 180px;
          background: linear-gradient(
            90deg,
            var(--bg-tertiary) 0%,
            var(--bg-secondary) 50%,
            var(--bg-tertiary) 100%
          );
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s ease-in-out infinite;
          border-radius: 4px;
        }

        .skeleton-bar:nth-child(1) {
          height: 60%;
        }

        .skeleton-bar:nth-child(2) {
          height: 100%;
        }

        .skeleton-bar:nth-child(3) {
          height: 80%;
        }

        @keyframes skeleton-loading {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .chart-spinner {
          width: 22px;
          height: 22px;
          border: 2px solid var(--border-color);
          border-top-color: var(--accent-color);
          border-radius: 999px;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        :global(.custom-tooltip) {
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 12px 14px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        :global(.custom-tooltip.mobile) {
          padding: 8px 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          max-width: 220px;
        }

        :global(.tooltip-label) {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        :global(.custom-tooltip.mobile .tooltip-label) {
          font-size: 11px;
          margin-bottom: 6px;
        }

        :global(.tooltip-item) {
          font-size: 13px;
          margin: 4px 0;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        :global(.tooltip-item.compact) {
          font-size: 11px;
          gap: 8px;
          margin: 2px 0;
        }

        :global(.tooltip-name) {
          color: var(--text-secondary);
        }

        :global(.tooltip-value) {
          font-weight: 600;
        }

        @media (max-width: 767px) {
          .chart-container {
            padding: 10px 0;
          }

          :global(.recharts-wrapper) {
            font-size: 11px;
          }
        }
      `}</style>
      {showSkeleton && (
        <div className="chart-skeleton">
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
          <div className="skeleton-bar" />
        </div>
      )}
    </div>
  );
}
