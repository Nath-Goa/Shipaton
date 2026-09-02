import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import { categoryOf } from '@/constants/categories';
import type { Expense } from '@/types/expense';
import { money } from '@/utils/money';

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildExpensesCsv(expenses: Expense[]): string {
  const header = ['Date', 'Description', 'Category', 'Amount', 'Recurring'];
  const rows = expenses.map((e) => [
    e.date,
    e.desc || categoryOf(e.category).label,
    categoryOf(e.category).label,
    e.amount.toFixed(2),
    e.recurring ?? '',
  ]);
  return [header, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(',')).join('\n');
}

export type ExportResult = { ok: true } | { ok: false; message: string };

export async function shareExpensesCsv(expenses: Expense[]): Promise<ExportResult> {
  if (expenses.length === 0) return { ok: false, message: 'No expenses to export yet.' };
  const available = await Sharing.isAvailableAsync();
  if (!available) return { ok: false, message: 'Sharing is not available on this device.' };
  try {
    const csv = buildExpensesCsv(expenses);
    const file = new File(Paths.cache, `expenses-${Date.now()}.csv`);
    if (file.exists) file.delete();
    file.create();
    await file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export expenses' });
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not export expenses.' };
  }
}

// Plain-text share via the OS share sheet — no file needed, works
// cross-platform through React Native's own Share API.
export async function sharePortfolioSummary(params: {
  name: string;
  netWorth: number;
  cash: number;
  allTimePnl: number;
  allTimePnlPct: number;
  holdingsCount: number;
}): Promise<ExportResult> {
  const lines = [
    `${params.name} — paper trading performance`,
    `Net worth: ${money(params.netWorth)}`,
    `Cash: ${money(params.cash)}`,
    `All-time P&L: ${money(params.allTimePnl)} (${params.allTimePnlPct >= 0 ? '+' : ''}${params.allTimePnlPct.toFixed(1)}%)`,
    `Open positions: ${params.holdingsCount}`,
    '',
    'Simulated paper trading — no real money involved.',
  ];
  try {
    await Share.share({ message: lines.join('\n') });
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not share your portfolio summary.' };
  }
}
