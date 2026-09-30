import { sendStructuredPrompt } from '@/services/ai/client';
import { buildSpendingInsightPrompt, buildWeeklyRecapAnalysisPrompt } from '@/services/ai/prompts';
import type { AiResult } from '@/types/ai';

export type SpendingInsight = { observation: string; tip: string };

export function generateSpendingInsight(spendingSummaryJson: string): Promise<AiResult<SpendingInsight>> {
  return sendStructuredPrompt<SpendingInsight>(buildSpendingInsightPrompt(), spendingSummaryJson);
}

export type WeeklyRecapAnalysis = { headline: string; explanation: string; nextStep: string };

export function generateWeeklyRecapAnalysis(recapSummaryJson: string): Promise<AiResult<WeeklyRecapAnalysis>> {
  return sendStructuredPrompt<WeeklyRecapAnalysis>(buildWeeklyRecapAnalysisPrompt(), recapSummaryJson);
}
