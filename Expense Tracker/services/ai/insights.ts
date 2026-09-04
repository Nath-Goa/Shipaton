import { sendStructuredPrompt } from '@/services/ai/client';
import { buildSpendingInsightPrompt, buildWeeklyRecapPrompt } from '@/services/ai/prompts';
import type { AiResult } from '@/types/ai';

export type SpendingInsight = { observation: string; tip: string };

export function generateSpendingInsight(spendingSummaryJson: string): Promise<AiResult<SpendingInsight>> {
  return sendStructuredPrompt<SpendingInsight>(buildSpendingInsightPrompt(), spendingSummaryJson);
}

export type WeeklyRecap = { headline: string; highlights: string[]; tip: string };

export function generateWeeklyRecap(weekSummaryJson: string): Promise<AiResult<WeeklyRecap>> {
  return sendStructuredPrompt<WeeklyRecap>(buildWeeklyRecapPrompt(), weekSummaryJson);
}
