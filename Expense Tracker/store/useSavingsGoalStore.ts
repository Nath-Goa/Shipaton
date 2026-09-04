import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { badgeInfo } from '@/constants/badges';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { RecurringFrequency } from '@/types/expense';
import { addDaysStr, addMonthsStr, todayStr } from '@/utils/date';
import { money } from '@/utils/money';
import { uid } from '@/utils/id';

export const MAX_SAVINGS_GOALS = 20;

function nextOccurrence(dateStr: string, freq: RecurringFrequency): string {
  return freq === 'weekly' ? addDaysStr(dateStr, 7) : addMonthsStr(dateStr, 1);
}

export type SavingsGoal = {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  createdAt: number;
  completedAt: string | null;
  recurringAmount: number | null;
  recurringFrequency: RecurringFrequency | null;
  nextContributionDate: string | null;
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
  // Sets up (or replaces) a recurring auto-contribution for a goal, mirroring
  // usePortfolioStore's auto-invest plans. Keeps running on schedule even
  // after the goal is reached — cancel it explicitly if that's not wanted.
  setRecurringContribution: (goalId: string, amount: number, frequency: RecurringFrequency) => void;
  cancelRecurringContribution: (goalId: string) => void;
  // Catches up every goal's recurring contribution to today, same
  // cursor+guard idempotent pattern as usePortfolioStore.processAutoInvests.
  // Safe to call on every app open.
  processRecurringContributions: () => void;
  // The goal every logged expense's spare change (rounded up to the next
  // dollar) gets routed into, or null if round-up saving is off.
  roundUpGoalId: string | null;
  setRoundUpGoal: (goalId: string | null) => void;
  // Called from useExpenseStore.addExpense with the expense amount that was
  // just logged — no-ops if round-up saving is off or its target goal was
  // since deleted.
  contributeRoundUp: (expenseAmount: number) => void;
};

export const useSavingsGoalStore = create<SavingsGoalState>()(
  persist(
    (set, get) => ({
      goals: [],
      roundUpGoalId: null,

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
          recurringAmount: null,
          recurringFrequency: null,
          nextContributionDate: null,
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
        const { roundUpGoalId } = get();
        set({
          goals: get().goals.filter((g) => g.id !== goalId),
          roundUpGoalId: roundUpGoalId === goalId ? null : roundUpGoalId,
        });
      },

      setRecurringContribution: (goalId, amount, frequency) => {
        if (!(amount > 0)) return;
        const { goals } = get();
        set({
          goals: goals.map((g) =>
            g.id === goalId
              ? { ...g, recurringAmount: amount, recurringFrequency: frequency, nextContributionDate: nextOccurrence(todayStr(), frequency) }
              : g
          ),
        });
      },

      cancelRecurringContribution: (goalId) => {
        const { goals } = get();
        set({
          goals: goals.map((g) =>
            g.id === goalId ? { ...g, recurringAmount: null, recurringFrequency: null, nextContributionDate: null } : g
          ),
        });
      },

      processRecurringContributions: () => {
        const today = todayStr();
        const { goals } = get();
        const notices: string[] = [];
        let changed = false;

        const nextGoals = goals.map((g) => {
          if (!g.recurringAmount || !g.recurringFrequency || !g.nextContributionDate) return g;
          let amount = g.currentAmount;
          let nextRun = g.nextContributionDate;
          let completedAt = g.completedAt;
          let cycles = 0;
          let guard = 0;
          while (guard < 24 && nextRun <= today) {
            amount += g.recurringAmount;
            cycles++;
            if (!completedAt && amount >= g.targetAmount) completedAt = nextRun;
            nextRun = nextOccurrence(nextRun, g.recurringFrequency);
            guard++;
          }
          if (cycles === 0) return g;
          changed = true;

          const justCompleted = completedAt !== g.completedAt;
          if (justCompleted) {
            const earned = useStreakStore.getState().awardBadge('goal_reached');
            const base = `🎉 "${g.name}" goal reached — ${money(amount)} saved!`;
            notices.push(earned.length ? `${base} · 🏅 ${badgeInfo(earned[0]).label} badge earned!` : base);
          } else {
            notices.push(`💰 Auto-saved ${money(cycles * g.recurringAmount)} into "${g.name}"`);
          }

          return { ...g, currentAmount: amount, nextContributionDate: nextRun, completedAt };
        });

        if (!changed) return;
        set({ goals: nextGoals });
        for (const notice of notices) useToastStore.getState().show(notice);
      },

      setRoundUpGoal: (goalId) => set({ roundUpGoalId: goalId }),

      contributeRoundUp: (expenseAmount) => {
        const { roundUpGoalId, goals } = get();
        if (!roundUpGoalId || !goals.some((g) => g.id === roundUpGoalId)) return;
        const roundUp = Math.round((Math.ceil(expenseAmount) - expenseAmount) * 100) / 100;
        if (roundUp <= 0) return;
        get().addContribution(roundUpGoalId, roundUp);
      },
    }),
    {
      name: 'savings-goal-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // v0 goals didn't have recurring-contribution fields — backfill them
      // to null so existing installs don't crash reading undefined.
      migrate: (persisted: any) => {
        if (persisted?.goals) {
          persisted.goals = persisted.goals.map((g: any) => ({
            ...g,
            recurringAmount: g.recurringAmount ?? null,
            recurringFrequency: g.recurringFrequency ?? null,
            nextContributionDate: g.nextContributionDate ?? null,
          }));
        }
        return persisted;
      },
    }
  )
);
