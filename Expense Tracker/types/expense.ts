import type { CategoryId } from '@/constants/categories';

export type RecurringFrequency = 'weekly' | 'monthly';

// The date-range presets used both by the Expenses list filter chips and by
// each saved pie chart's own configured range (store/useSavedChartsStore.ts).
export type DateRangePreset = 'all' | 'month' | '30' | 'year';

export type Expense = {
  id: string;
  desc: string;
  amount: number;
  date: string; // "YYYY-MM-DD", local
  category: CategoryId;
  // Only meaningful when category === 'other' — a short user-typed label
  // (e.g. "Gift", "Pet supplies") shown in place of the generic "Other".
  customCategoryLabel?: string;
  photoUri?: string;
  recurring?: RecurringFrequency;
  // Present only on recurring expenses — groups an original entry together
  // with every instance auto-generated from it (see
  // useExpenseStore.generateDueRecurring). Absent on one-off expenses.
  seriesId?: string;
};
