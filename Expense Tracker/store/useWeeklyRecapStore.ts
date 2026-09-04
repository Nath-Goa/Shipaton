import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { WeeklyRecap } from '@/services/ai/insights';

type WeeklyRecapState = {
  recap: WeeklyRecap | null;
  generatedAt: number | null;
  setRecap: (recap: WeeklyRecap) => void;
};

// Caches the last AI-generated weekly recap so it survives an app restart —
// the Home screen shows this until the user taps "Refresh", rather than
// re-calling the AI on every open.
export const useWeeklyRecapStore = create<WeeklyRecapState>()(
  persist(
    (set) => ({
      recap: null,
      generatedAt: null,
      setRecap: (recap) => set({ recap, generatedAt: Date.now() }),
    }),
    {
      name: 'weekly-recap-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
