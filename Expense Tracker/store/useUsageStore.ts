import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { StudyWindow } from '@/store/useSettingsStore';

// A phone can't see what you do in OTHER apps without an invasive,
// Play-Store-unfriendly permission (Android Usage Access; no iOS
// equivalent). So "learns your timing" here means learning THIS app's own
// open pattern — an hour-of-day histogram, cumulative, no raw timestamp log
// kept around. See services/notifications/studyNudge.ts for how the
// suggested hour turns into an actual reminder.
const MIN_OPENS_BEFORE_TRUSTING_HISTOGRAM = 5;

const WINDOW_HOUR: Record<StudyWindow, number> = {
  morning: 8,
  afternoon: 13,
  evening: 18,
  night: 21,
};

type UsageState = {
  openHistogram: number[]; // length 24, index = hour-of-day (device local time)
  totalOpens: number;
  recordAppOpen: () => void;
  // `explicitWindow` is the user's own answer (onboarding or Settings) —
  // used as a seed before enough implicit data exists, and as a tie-breaker
  // fallback forever after. Returns null only when there's neither.
  getSuggestedHour: (explicitWindow: StudyWindow | null) => number | null;
};

function freshHistogram(): number[] {
  return new Array(24).fill(0);
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      openHistogram: freshHistogram(),
      totalOpens: 0,

      recordAppOpen: () => {
        const hour = new Date().getHours();
        set((state) => {
          const histogram = [...state.openHistogram];
          histogram[hour] = (histogram[hour] ?? 0) + 1;
          return { openHistogram: histogram, totalOpens: state.totalOpens + 1 };
        });
      },

      getSuggestedHour: (explicitWindow) => {
        const { openHistogram, totalOpens } = get();
        if (totalOpens < MIN_OPENS_BEFORE_TRUSTING_HISTOGRAM) {
          return explicitWindow ? WINDOW_HOUR[explicitWindow] : null;
        }
        let bestHour = 0;
        let bestCount = -1;
        for (let hour = 0; hour < 24; hour++) {
          if (openHistogram[hour] > bestCount) {
            bestCount = openHistogram[hour];
            bestHour = hour;
          }
        }
        return bestCount > 0 ? bestHour : explicitWindow ? WINDOW_HOUR[explicitWindow] : null;
      },
    }),
    {
      name: 'usage-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
