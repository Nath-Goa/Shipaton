import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deleteReceiptFile } from '@/services/receipts/capture';
import type { Expense } from '@/types/expense';
import { daysAgo } from '@/utils/date';
import { uid } from '@/utils/id';

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
        set((state) => ({ expenses: [{ id: uid(), ...input }, ...state.expenses] }));
      },
      updateExpense: (id, patch) => {
        const prior = get().expenses.find((e) => e.id === id);
        if (prior?.photoUri && prior.photoUri !== patch.photoUri) {
          deleteReceiptFile(prior.photoUri);
        }
        set((state) => ({
          expenses: state.expenses.map((e) => (e.id === id ? { id, ...patch } : e)),
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
    }),
    {
      name: 'expense-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ expenses: state.expenses, hasSeeded: state.hasSeeded }),
    }
  )
);
