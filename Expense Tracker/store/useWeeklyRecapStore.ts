import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WeeklyRecapAnalysis } from '@/services/ai/insights';

type WeeklyRecapState = {
  analysis: WeeklyRecapAnalysis | null;
  generatedAt: number | null;
  setAnalysis: (analysis: WeeklyRecapAnalysis) => void;
};

export const useWeeklyRecapStore = create<WeeklyRecapState>()(
  persist(
    (set) => ({
      analysis: null,
      generatedAt: null,
      setAnalysis: (analysis) => set({ analysis, generatedAt: Date.now() }),
    }),
    {
      // The old inline recap used a different persisted shape under the v1
      // key, so a new key prevents stale installs from hydrating invalid data.
      name: 'weekly-recap-analysis-store-v2',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
