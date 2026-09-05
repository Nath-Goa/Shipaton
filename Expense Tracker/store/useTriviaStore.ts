import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useStreakStore } from '@/store/useStreakStore';
import { todayStr } from '@/utils/date';

// Free daily trivia battle vs a seeded AI opponent (Learn tab). One round
// per calendar day, same cursor-based "already done today?" shape as the
// rest of the app's daily features (CLAUDE.md §7 rule #6) — lastPlayedDate
// is the whole state needed to answer "can they play again," no cron job,
// checked whenever the screen opens.
type TriviaResult = 'win' | 'loss' | 'tie';

type TriviaState = {
  lastPlayedDate: string | null;
  lastResult: TriviaResult | null;
  lastYourScore: number;
  lastBotScore: number;
  wins: number;
  losses: number;
  ties: number;
  currentStreak: number;
  bestStreak: number;
  hasPlayedToday: () => boolean;
  /** Returns any newly-earned badge ids. */
  recordResult: (result: TriviaResult, yourScore: number, botScore: number) => string[];
};

export const useTriviaStore = create<TriviaState>()(
  persist(
    (set, get) => ({
      lastPlayedDate: null,
      lastResult: null,
      lastYourScore: 0,
      lastBotScore: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      currentStreak: 0,
      bestStreak: 0,

      hasPlayedToday: () => get().lastPlayedDate === todayStr(),

      recordResult: (result, yourScore, botScore) => {
        const nextStreak = result === 'win' ? get().currentStreak + 1 : 0;
        set((state) => ({
          lastPlayedDate: todayStr(),
          lastResult: result,
          lastYourScore: yourScore,
          lastBotScore: botScore,
          wins: state.wins + (result === 'win' ? 1 : 0),
          losses: state.losses + (result === 'loss' ? 1 : 0),
          ties: state.ties + (result === 'tie' ? 1 : 0),
          currentStreak: nextStreak,
          bestStreak: Math.max(state.bestStreak, nextStreak),
        }));

        const earned: string[] = [];
        if (result === 'win') {
          const [firstWin] = useStreakStore.getState().awardBadge('trivia_first_win');
          if (firstWin) earned.push(firstWin);
        }
        if (get().currentStreak >= 5) {
          const [streakBadge] = useStreakStore.getState().awardBadge('trivia_streak_5');
          if (streakBadge) earned.push(streakBadge);
        }
        return earned;
      },
    }),
    {
      name: 'trivia-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
