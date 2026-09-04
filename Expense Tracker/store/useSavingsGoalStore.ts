import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { badgeInfo } from '@/constants/badges';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import { todayStr } from '@/utils/date';
import { money } from '@/utils/money';
import { uid } from '@/utils/id';

export const MAX_SAVINGS_GOALS = 20;

export type SavingsGoal = {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  createdAt: number;
  completedAt: string | null;
};

export type CreateGoalResult = { ok: true; id: string } | { ok: false; message: string };

type SavingsGoalState = {
  goals: SavingsGoal[];
  createGoal: (name: string, icon: string, targetAmount: number, targetDate: string | null) => CreateGoalResult;
  // delta can be negative to remove a contribution; currentAmount is clamped
  // to never go below 0. completedAt is sticky — once a goal is hit it stays
  // marked complete even if a later negative contribution drops it back
  // under target, matching how the rest of the app treats one-off badge
  // milestones (they don't get revoked).
  addContribution: (goalId: string, delta: number) => void;
  deleteGoal: (goalId: string) => void;
};

export const useSavingsGoalStore = create<SavingsGoalState>()(
  persist(
    (set, get) => ({
      goals: [],

      createGoal: (name, icon, targetAmount, targetDate) => {
        const trimmed = name.trim();
        if (!trimmed) return { ok: false, message: 'Give the goal a name.' };
        if (!(targetAmount > 0)) return { ok: false, message: 'Enter a target greater than 0.' };
        const { goals } = get();
        if (goals.length >= MAX_SAVINGS_GOALS) {
          return { ok: false, message: `You can have up to ${MAX_SAVINGS_GOALS} savings goals at once.` };
        }
        const goal: SavingsGoal = {
          id: uid(),
          name: trimmed,
          icon,
          targetAmount,
          currentAmount: 0,
          targetDate,
          createdAt: Date.now(),
          completedAt: null,
        };
        set({ goals: [goal, ...goals] });
        return { ok: true, id: goal.id };
      },

      addContribution: (goalId, delta) => {
        const { goals } = get();
        const goal = goals.find((g) => g.id === goalId);
        if (!goal) return;
        const currentAmount = Math.max(0, goal.currentAmount + delta);
        const justCompleted = !goal.completedAt && currentAmount >= goal.targetAmount;
        const completedAt = goal.completedAt ?? (justCompleted ? todayStr() : null);
        set({ goals: goals.map((g) => (g.id === goalId ? { ...g, currentAmount, completedAt } : g)) });

        if (justCompleted) {
          const earned = useStreakStore.getState().awardBadge('goal_reached');
          const base = `🎉 "${goal.name}" goal reached — ${money(currentAmount)} saved!`;
          useToastStore.getState().show(earned.length ? `${base} · 🏅 ${badgeInfo(earned[0]).label} badge earned!` : base);
        }
      },

      deleteGoal: (goalId) => {
        set({ goals: get().goals.filter((g) => g.id !== goalId) });
      },
    }),
    {
      name: 'savings-goal-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
