import { sendStructuredPrompt } from '@/services/ai/client';
import { buildSpendingInsightPrompt } from '@/services/ai/prompts';
import type { AiResult } from '@/types/ai';

export type SpendingInsight = { observation: string; tip: string };

export function generateSpendingInsight(spendingSummaryJson: string): Promise<AiResult<SpendingInsight>> {
  return sendStructuredPrompt<SpendingInsight>(buildSpendingInsightPrompt(), spendingSummaryJson);
}
