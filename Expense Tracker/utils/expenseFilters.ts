import type { Expense, DateRangePreset } from '@/types/expense';
import { daysAgo, toDateStr, todayStr } from '@/utils/date';

// Shared by the Expenses list filter chips and each saved pie chart's own
// independent date range — kept in one place so the two never drift apart.
export function filterExpensesByPreset(expenses: Expense[], preset: DateRangePreset): Expense[] {
  if (preset === 'all') return expenses;
  let fromStr: string;
  if (preset === 'today') fromStr = todayStr();
  // Rolling 7-day window (today + 6 days back), not a calendar week — same
  // "last N days" shape as the old 30-day preset, and matches the rolling
  // window Weekly Recap already uses (services/recap/weeklyRecap.ts).
  else if (preset === 'week') fromStr = daysAgo(6);
  else if (preset === 'month') fromStr = toDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  else fromStr = toDateStr(new Date(new Date().getFullYear(), 0, 1));
  return expenses.filter((e) => e.date >= fromStr);
}
