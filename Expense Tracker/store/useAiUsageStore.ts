import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { AI_FEATURE_DAILY_LIMIT, type Tier } from '@/constants/subscription';
import { todayStr } from '@/utils/date';

// A single daily counter shared across EVERY AI feature (chat messages,
// quiz/challenge generation, pattern detection, receipt auto-fill, spending
// insights) — but only ever consulted/incremented when a call actually runs
// on the shared free-tier key (see services/ai/client.ts). A working
// personal API key is unlimited and never touches this counter.
type AiUsageState = {
  date: string;
  count: number;
  recordUsage: () => void;
  usedToday: () => number;
  remainingToday: (tier: Tier) => number;
};

export const useAiUsageStore = create<AiUsageState>()(
  persist(
    (set, get) => ({
      date: todayStr(),
      count: 0,
      recordUsage: () => {
        set((state) => {
          const isToday = state.date === todayStr();
          return { date: todayStr(), count: (isToday ? state.count : 0) + 1 };
        });
      },
      usedToday: () => {
        const state = get();
        return state.date === todayStr() ? state.count : 0;
      },
      remainingToday: (tier) => {
        return Math.max(0, AI_FEATURE_DAILY_LIMIT[tier] - get().usedToday());
      },
    }),
    {
      name: 'ai-usage-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
