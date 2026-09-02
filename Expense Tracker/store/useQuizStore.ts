import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { QUIZ_TOPICS } from '@/constants/quizTopics';
import type { Difficulty, QuizAttempt, TopicProgress } from '@/types/quiz';
import { parseDateLocal, toDateStr, todayStr } from '@/utils/date';

// Spaced-repetition scheduling: a pass (score >= 70) advances through
// [1, 3, 7, 14]-day review intervals as consecutiveCorrect grows; a miss
// resets the interval to tomorrow and steps difficulty down a notch. There's
// no server/cron here — this store is just checked against today's date
// whenever the Learn tab is opened.
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14];
const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];
const PASS_THRESHOLD = 70;

function addDays(dateStr: string, days: number): string {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

type QuizState = {
  attempts: QuizAttempt[];
  topicProgress: Record<string, TopicProgress>;
  recordAttempt: (topic: string, score: number, difficulty: Difficulty) => { mastered: boolean };
  getDueTopic: () => string | null;
  getNextNewTopic: () => string | null;
  getProgressFor: (topic: string) => TopicProgress | undefined;
};

export const useQuizStore = create<QuizState>()(
  persist(
    (set, get) => ({
      attempts: [],
      topicProgress: {},

      recordAttempt: (topic, score, difficulty) => {
        const today = todayStr();
        const prior = get().topicProgress[topic];
        const passed = score >= PASS_THRESHOLD;
        const consecutiveCorrect = passed ? (prior?.consecutiveCorrect ?? 0) + 1 : 0;

        const idx = DIFFICULTY_ORDER.indexOf(difficulty);
        let nextDifficulty = difficulty;
        if (passed && consecutiveCorrect >= 3 && idx < DIFFICULTY_ORDER.length - 1) {
          nextDifficulty = DIFFICULTY_ORDER[idx + 1];
        } else if (!passed && idx > 0) {
          nextDifficulty = DIFFICULTY_ORDER[idx - 1];
        }

        const intervalDays = passed ? REVIEW_INTERVALS_DAYS[Math.min(consecutiveCorrect - 1, REVIEW_INTERVALS_DAYS.length - 1)] : 1;
        const justMastered = nextDifficulty === 'hard' && passed && score >= 85 && consecutiveCorrect >= 3;
        const mastered = justMastered || prior?.mastered || false;

        const progress: TopicProgress = {
          topic,
          lastAttemptDate: today,
          lastScore: score,
          consecutiveCorrect,
          currentDifficulty: nextDifficulty,
          nextReviewDate: addDays(today, intervalDays),
          mastered,
        };

        set((state) => ({
          attempts: [...state.attempts, { topic, date: today, score, difficulty }],
          topicProgress: { ...state.topicProgress, [topic]: progress },
        }));

        return { mastered: justMastered };
      },

      getDueTopic: () => {
        const today = todayStr();
        const due = Object.values(get().topicProgress)
          .filter((p) => !p.mastered && p.nextReviewDate <= today)
          .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
        return due[0]?.topic ?? null;
      },

      getNextNewTopic: () => {
        const seen = new Set(Object.keys(get().topicProgress));
        return QUIZ_TOPICS.find((t) => !seen.has(t.id))?.id ?? null;
      },

      getProgressFor: (topic) => get().topicProgress[topic],
    }),
    {
      name: 'quiz-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
