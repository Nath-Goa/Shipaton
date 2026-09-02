import type { CategoryId } from '@/constants/categories';

export type RecurringFrequency = 'weekly' | 'monthly';

export type Expense = {
  id: string;
  desc: string;
  amount: number;
  date: string; // "YYYY-MM-DD", local
  category: CategoryId;
  photoUri?: string;
  recurring?: RecurringFrequency;
  // Present only on recurring expenses — groups an original entry together
  // with every instance auto-generated from it (see
  // useExpenseStore.generateDueRecurring). Absent on one-off expenses.
  seriesId?: string;
};
