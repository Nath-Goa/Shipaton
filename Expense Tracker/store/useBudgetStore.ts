import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CategoryId } from '@/constants/categories';

type BudgetState = {
  // Monthly limits — undefined/absent means "no budget set" for that slot.
  overallBudget: number | null;
  categoryBudgets: Partial<Record<CategoryId, number>>;
  setOverallBudget: (amount: number | null) => void;
  setCategoryBudget: (category: CategoryId, amount: number | null) => void;
};

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set) => ({
      overallBudget: null,
      categoryBudgets: {},
      setOverallBudget: (amount) => set({ overallBudget: amount && amount > 0 ? amount : null }),
      setCategoryBudget: (category, amount) => {
        set((state) => {
          const next = { ...state.categoryBudgets };
          if (amount && amount > 0) next[category] = amount;
          else delete next[category];
          return { categoryBudgets: next };
        });
      },
    }),
    {
      name: 'budget-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
