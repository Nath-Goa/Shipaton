import type { Expense, DateRangePreset } from '@/types/expense';
import { toDateStr } from '@/utils/date';

// Shared by the Expenses list filter chips and each saved pie chart's own
// independent date range — kept in one place so the two never drift apart.
export function filterExpensesByPreset(expenses: Expense[], preset: DateRangePreset): Expense[] {
  if (preset === 'all') return expenses;
  const now = new Date();
  let from: Date;
  if (preset === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (preset === '30') {
    from = new Date();
    from.setDate(from.getDate() - 29);
  } else from = new Date(now.getFullYear(), 0, 1);
  const fromStr = toDateStr(from);
  return expenses.filter((e) => e.date >= fromStr);
}
