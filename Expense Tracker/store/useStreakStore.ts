import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { daysAgo, todayStr } from '@/utils/date';

const STREAK_MILESTONES = [3, 7, 30];
const PATTERN_MASTER_THRESHOLD = 5;
const ANALYST_BADGE_THRESHOLD = 10;

type StreakState = {
  streakDays: number;
  bestStreakDays: number;
  lastActivityDate: string | null;
  badges: string[];
  patternDetectionsViewed: number;
  analystQuestionsAsked: number;
  narrativeCompletionsToday: { date: string; count: number };
  // Each returns the list of badge ids newly earned by this action (may be empty).
  recordQuizActivity: () => string[];
  recordPatternDetectionViewed: () => string[];
  recordAnalystQuestion: () => string[];
  recordNarrativeCompleted: () => string[];
  getNarrativeCompletionsToday: () => number;
  // Generic one-off badge award (first trade, diversified portfolio, budget
  // met, etc.) — idempotent, returns [id] the first time, [] every time
  // after.
  awardBadge: (id: string) => string[];
};

function awardMilestoneBadges(badges: string[], value: number, milestones: number[], prefix: string): string[] {
  const earned: string[] = [];
  for (const m of milestones) {
    const id = `${prefix}${m}`;
    if (value >= m && !badges.includes(id)) earned.push(id);
  }
  return earned;
}

export const useStreakStore = create<StreakState>()(
  persist(
    (set, get) => ({
      streakDays: 0,
      bestStreakDays: 0,
      lastActivityDate: null,
      badges: [],
      patternDetectionsViewed: 0,
      analystQuestionsAsked: 0,
      narrativeCompletionsToday: { date: todayStr(), count: 0 },

      recordQuizActivity: () => {
        const today = todayStr();
        const state = get();
        if (state.lastActivityDate === today) return [];

        const wasYesterday = state.lastActivityDate === daysAgo(1);
        const newStreak = wasYesterday ? state.streakDays + 1 : 1;
        const earned = awardMilestoneBadges(state.badges, newStreak, STREAK_MILESTONES, 'streak_');

        set({
          streakDays: newStreak,
          bestStreakDays: Math.max(state.bestStreakDays, newStreak),
          lastActivityDate: today,
          badges: [...state.badges, ...earned],
        });
        return earned;
      },

      recordPatternDetectionViewed: () => {
        const state = get();
        const count = state.patternDetectionsViewed + 1;
        const earned = count >= PATTERN_MASTER_THRESHOLD && !state.badges.includes('pattern_master') ? ['pattern_master'] : [];
        set({ patternDetectionsViewed: count, badges: earned.length ? [...state.badges, ...earned] : state.badges });
        return earned;
      },

      recordAnalystQuestion: () => {
        const state = get();
        const count = state.analystQuestionsAsked + 1;
        const earned = count >= ANALYST_BADGE_THRESHOLD && !state.badges.includes('analyst') ? ['analyst'] : [];
        set({ analystQuestionsAsked: count, badges: earned.length ? [...state.badges, ...earned] : state.badges });
        return earned;
      },

      recordNarrativeCompleted: () => {
        const today = todayStr();
        const state = get();
        const priorCount = state.narrativeCompletionsToday.date === today ? state.narrativeCompletionsToday.count : 0;
        set({ narrativeCompletionsToday: { date: today, count: priorCount + 1 } });
        // A completed narrative counts as a day's learning activity too.
        return get().recordQuizActivity();
      },

      getNarrativeCompletionsToday: () => {
        const state = get();
        return state.narrativeCompletionsToday.date === todayStr() ? state.narrativeCompletionsToday.count : 0;
      },

      awardBadge: (id) => {
        const state = get();
        if (state.badges.includes(id)) return [];
        set({ badges: [...state.badges, id] });
        return [id];
      },
    }),
    {
      name: 'streak-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
