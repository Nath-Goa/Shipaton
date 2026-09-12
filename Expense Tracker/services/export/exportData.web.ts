import { categoryOf } from '@/constants/categories';
import type { Expense } from '@/types/expense';
import { money } from '@/utils/money';

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildExpensesCsv(expenses: Expense[]): string {
  const header = ['Date', 'Description', 'Category', 'Amount', 'Recurring'];
  const rows = expenses.map((expense) => [
    expense.date,
    expense.desc || categoryOf(expense.category).label,
    categoryOf(expense.category).label,
    expense.amount.toFixed(2),
    expense.recurring ?? '',
  ]);
  return [header, ...rows].map((row) => row.map((value) => csvEscape(String(value))).join(',')).join('\n');
}

export type ExportResult = { ok: true } | { ok: false; message: string };

export async function shareExpensesCsv(expenses: Expense[]): Promise<ExportResult> {
  if (expenses.length === 0) return { ok: false, message: 'No expenses to export yet.' };
  if (typeof document === 'undefined') return { ok: false, message: 'Export is not available here.' };
  try {
    const blob = new Blob([buildExpensesCsv(expenses)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expenses-${Date.now()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not export expenses.' };
  }
}

export async function sharePortfolioSummary(params: {
  name: string;
  netWorth: number;
  cash: number;
  allTimePnl: number;
  allTimePnlPct: number;
  holdingsCount: number;
}): Promise<ExportResult> {
  const message = [
    `${params.name} — paper trading performance`,
    `Net worth: ${money(params.netWorth)}`,
    `Cash: ${money(params.cash)}`,
    `All-time P&L: ${money(params.allTimePnl)} (${params.allTimePnlPct >= 0 ? '+' : ''}${params.allTimePnlPct.toFixed(1)}%)`,
    `Open positions: ${params.holdingsCount}`,
    '',
    'Simulated paper trading — no real money involved.',
  ].join('\n');
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return { ok: false, message: 'Sharing is not available in this browser.' };
  }
  try {
    await navigator.share({ text: message });
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not share your portfolio summary.' };
  }
}
