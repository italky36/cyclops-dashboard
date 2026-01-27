import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Layer, AutoPaymentRule } from '@/types/cyclops';

interface AppState {
  // Текущий слой
  layer: Layer;
  setLayer: (layer: Layer) => void;

  // Статус подключения
  connectionStatus: Record<Layer, 'unknown' | 'connected' | 'error'>;
  setConnectionStatus: (layer: Layer, status: 'unknown' | 'connected' | 'error') => void;

  // Автоматические выплаты
  autoPaymentRules: AutoPaymentRule[];
  addAutoPaymentRule: (rule: AutoPaymentRule) => void;
  updateAutoPaymentRule: (id: string, updates: Partial<AutoPaymentRule>) => void;
  removeAutoPaymentRule: (id: string) => void;
  toggleAutoPaymentRule: (id: string) => void;

  // Избранные бенефициары
  favoriteBeneficiaries: string[];
  toggleFavoriteBeneficiary: (id: string) => void;

  // Последние действия
  recentActions: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: number;
    layer: Layer;
  }>;
  addRecentAction: (action: Omit<AppState['recentActions'][0], 'id' | 'timestamp'>) => void;
  clearRecentActions: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Текущий слой
      layer: 'pre',
      setLayer: (layer) => set({ layer }),

      // Статус подключения
      connectionStatus: { pre: 'unknown', prod: 'unknown' },
      setConnectionStatus: (layer, status) =>
        set((state) => ({
          connectionStatus: { ...state.connectionStatus, [layer]: status },
        })),

      // Автоматические выплаты
      autoPaymentRules: [],
      addAutoPaymentRule: (rule) =>
        set((state) => ({
          autoPaymentRules: [...state.autoPaymentRules, rule],
        })),
      updateAutoPaymentRule: (id, updates) =>
        set((state) => ({
          autoPaymentRules: state.autoPaymentRules.map((rule) =>
            rule.id === id ? { ...rule, ...updates } : rule
          ),
        })),
      removeAutoPaymentRule: (id) =>
        set((state) => ({
          autoPaymentRules: state.autoPaymentRules.filter((rule) => rule.id !== id),
        })),
      toggleAutoPaymentRule: (id) =>
        set((state) => ({
          autoPaymentRules: state.autoPaymentRules.map((rule) =>
            rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
          ),
        })),

      // Избранные бенефициары
      favoriteBeneficiaries: [],
      toggleFavoriteBeneficiary: (id) =>
        set((state) => ({
          favoriteBeneficiaries: state.favoriteBeneficiaries.includes(id)
            ? state.favoriteBeneficiaries.filter((fid) => fid !== id)
            : [...state.favoriteBeneficiaries, id],
        })),

      // Последние действия
      recentActions: [],
      addRecentAction: (action) =>
        set((state) => ({
          recentActions: [
            {
              ...action,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            },
            ...state.recentActions.slice(0, 49), // Храним последние 50
          ],
        })),
      clearRecentActions: () => set({ recentActions: [] }),
    }),
    {
      name: 'cyclops-dashboard-storage',
      partialize: (state) => ({
        layer: state.layer,
        autoPaymentRules: state.autoPaymentRules,
        favoriteBeneficiaries: state.favoriteBeneficiaries,
      }),
    }
  )
);

// Селекторы для удобства
export const useLayer = () => useAppStore((state) => state.layer);
export const useSetLayer = () => useAppStore((state) => state.setLayer);
export const useConnectionStatus = () => useAppStore((state) => state.connectionStatus);
export const useAutoPaymentRules = () => useAppStore((state) => state.autoPaymentRules);
