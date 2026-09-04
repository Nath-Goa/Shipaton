import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { DateRangePreset } from '@/types/expense';
import { uid } from '@/utils/id';

export type SavedPieChart = {
  id: string;
  // null until the user finishes naming + picking a range — a chart in this
  // state is a "draft": if it's also the most-recently-opened one, the
  // Expenses screen falls back to the mock chart rather than show it broken.
  name: string | null;
  preset: DateRangePreset | null;
  createdAt: number;
  lastOpenedAt: number;
};

function isConfigured(chart: SavedPieChart): boolean {
  return !!chart.name?.trim() && !!chart.preset;
}

type CreateResult = { ok: true; id: string } | { ok: false; message: string };

type SavedChartsState = {
  charts: SavedPieChart[];
  lastOpenedChartId: string | null;
  // Enforces the tier limit — pass the current tier's savedChartLimit.
  createDraftChart: (limit: number) => CreateResult;
  configureChart: (id: string, name: string, preset: DateRangePreset) => void;
  openChart: (id: string) => void;
  deleteChart: (id: string) => void;
  // Resolves lastOpenedChartId to a real, fully-configured chart — null
  // means "show the mock chart instead" (nothing saved yet, or the most
  // recent one is an abandoned draft).
  getActiveChart: () => SavedPieChart | null;
};

export const useSavedChartsStore = create<SavedChartsState>()(
  persist(
    (set, get) => ({
      charts: [],
      lastOpenedChartId: null,

      createDraftChart: (limit) => {
        const { charts } = get();
        if (charts.length >= limit) {
          return { ok: false, message: `You can save up to ${limit} pie charts on your current plan.` };
        }
        const chart: SavedPieChart = {
          id: uid(),
          name: null,
          preset: null,
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
        };
        set({ charts: [chart, ...charts], lastOpenedChartId: chart.id });
        return { ok: true, id: chart.id };
      },

      configureChart: (id, name, preset) => {
        set((state) => ({
          charts: state.charts.map((c) => (c.id === id ? { ...c, name: name.trim(), preset } : c)),
        }));
      },

      openChart: (id) => {
        set((state) => ({
          lastOpenedChartId: id,
          charts: state.charts.map((c) => (c.id === id ? { ...c, lastOpenedAt: Date.now() } : c)),
        }));
      },

      deleteChart: (id) => {
        set((state) => {
          const charts = state.charts.filter((c) => c.id !== id);
          const wasActive = state.lastOpenedChartId === id;
          // Falls back to whichever remaining chart was opened most
          // recently, or null (mock chart) if none are left.
          const next = wasActive
            ? [...charts].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0]?.id ?? null
            : state.lastOpenedChartId;
          return { charts, lastOpenedChartId: next };
        });
      },

      getActiveChart: () => {
        const { charts, lastOpenedChartId } = get();
        const active = charts.find((c) => c.id === lastOpenedChartId);
        return active && isConfigured(active) ? active : null;
      },
    }),
    {
      name: 'saved-charts-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
