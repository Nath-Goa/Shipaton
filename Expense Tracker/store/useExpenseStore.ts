import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deleteReceiptFile } from '@/services/receipts/capture';
import type { Expense, RecurringFrequency } from '@/types/expense';
import { addDaysStr, addMonthsStr, daysAgo, todayStr } from '@/utils/date';
import { uid } from '@/utils/id';

function nextOccurrence(dateStr: string, freq: RecurringFrequency): string {
  return freq === 'weekly' ? addDaysStr(dateStr, 7) : addMonthsStr(dateStr, 1);
}

function seedExpenses(): Expense[] {
  return [
    { id: uid(), desc: 'Grocery run', category: 'food', amount: 64.32, date: daysAgo(1) },
    { id: uid(), desc: 'Ride to airport', category: 'transport', amount: 28.5, date: daysAgo(2) },
    { id: uid(), desc: 'Monthly rent', category: 'housing', amount: 1450, date: daysAgo(3) },
    { id: uid(), desc: 'Electricity bill', category: 'utilities', amount: 76.4, date: daysAgo(5) },
    { id: uid(), desc: 'New headphones', category: 'shopping', amount: 129.99, date: daysAgo(6) },
    { id: uid(), desc: 'Pharmacy', category: 'health', amount: 18.75, date: daysAgo(8) },
    { id: uid(), desc: 'Movie night', category: 'entertainment', amount: 32, date: daysAgo(9) },
    { id: uid(), desc: 'Coffee with client', category: 'food', amount: 9.4, date: daysAgo(11) },
    { id: uid(), desc: 'Online course', category: 'education', amount: 49, date: daysAgo(14) },
    { id: uid(), desc: 'Weekend trip', category: 'travel', amount: 210, date: daysAgo(18) },
  ];
}

type ExpenseState = {
  expenses: Expense[];
  hasSeeded: boolean;
  lastDeleted: { expense: Expense; index: number } | null;
  seedIfNeeded: () => void;
  addExpense: (input: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, patch: Omit<Expense, 'id'>) => void;
  deleteExpense: (id: string) => void;
  undoDelete: () => void;
  // Catches up every recurring series to today, generating one expense per
  // elapsed cycle since its latest instance. Idempotent — safe to call on
  // every app open.
  generateDueRecurring: () => void;
};

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      expenses: [],
      hasSeeded: false,
      lastDeleted: null,
      seedIfNeeded: () => {
        if (get().hasSeeded) return;
        set({ expenses: seedExpenses(), hasSeeded: true });
      },
      addExpense: (input) => {
        const id = uid();
        // A brand-new recurring expense starts its own series, keyed by its
        // own id.
        const seriesId = input.recurring ? id : undefined;
        set((state) => ({ expenses: [{ ...input, id, seriesId }, ...state.expenses] }));
      },
      updateExpense: (id, patch) => {
        const prior = get().expenses.find((e) => e.id === id);
        if (prior?.photoUri && prior.photoUri !== patch.photoUri) {
          deleteReceiptFile(prior.photoUri);
        }
        // Turning recurring on keeps the series it already belonged to (an
        // edit to the latest instance), or starts a new one; turning it off
        // drops the series link.
        const seriesId = patch.recurring ? (prior?.recurring ? prior.seriesId ?? id : id) : undefined;
        set((state) => ({
          expenses: state.expenses.map((e) => (e.id === id ? { ...patch, id, seriesId } : e)),
        }));
      },
      deleteExpense: (id) => {
        const idx = get().expenses.findIndex((e) => e.id === id);
        if (idx === -1) return;
        const expense = get().expenses[idx];
        // Only one pending "undo" slot exists at a time, so this delete
        // superseding an earlier one means that earlier one's undo window
        // is now provably gone — safe to reclaim its photo file. The photo
        // for *this* delete stays on disk until superseded in turn (or the
        // app is closed), so Undo can still restore it in the meantime.
        const superseded = get().lastDeleted;
        if (superseded?.expense.photoUri) deleteReceiptFile(superseded.expense.photoUri);
        set((state) => ({
          expenses: state.expenses.filter((e) => e.id !== id),
          lastDeleted: { expense, index: idx },
        }));
      },
      undoDelete: () => {
        const pending = get().lastDeleted;
        if (!pending) return;
        set((state) => {
          const next = [...state.expenses];
          next.splice(Math.min(pending.index, next.length), 0, pending.expense);
          return { expenses: next, lastDeleted: null };
        });
      },
      generateDueRecurring: () => {
        const today = todayStr();
        const expenses = get().expenses;
        const latestBySeries = new Map<string, Expense>();
        for (const e of expenses) {
          if (!e.recurring || !e.seriesId) continue;
          const cur = latestBySeries.get(e.seriesId);
          if (!cur || e.date > cur.date) latestBySeries.set(e.seriesId, e);
        }

        const generated: Expense[] = [];
        for (const latest of latestBySeries.values()) {
          let cursor = nextOccurrence(latest.date, latest.recurring!);
          let guard = 0;
          // Caps catch-up at 24 cycles (2 years weekly, or 2 years monthly)
          // so a very stale install doesn't flood the list in one go.
          while (cursor <= today && guard < 24) {
            generated.push({ ...latest, id: uid(), date: cursor });
            cursor = nextOccurrence(cursor, latest.recurring!);
            guard++;
          }
        }

        if (generated.length) {
          set((state) => ({ expenses: [...generated, ...state.expenses] }));
        }
      },
    }),
    {
      name: 'expense-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ expenses: state.expenses, hasSeeded: state.hasSeeded }),
    }
  )
);
