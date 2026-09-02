import { sendStructuredPrompt } from '@/services/ai/client';
import { buildNarrativePrompt, buildPatternDetectionPrompt, buildQuizPrompt } from '@/services/ai/prompts';
import type { AiResult } from '@/types/ai';
import type { ScenarioType, NarrativeScenario } from '@/types/narrative';
import type { PatternDetectionResult } from '@/types/pattern';
import type { PriceBar } from '@/types/stock';
import type { Difficulty, QuizQuestion } from '@/types/quiz';

export async function generateQuiz(
  topicLabel: string,
  difficulty: Difficulty,
  context?: string
): Promise<AiResult<QuizQuestion>> {
  return sendStructuredPrompt<QuizQuestion>(
    buildQuizPrompt(topicLabel, difficulty, context),
    'Generate the quiz question now.'
  );
}

export async function detectPatterns(symbol: string, bars: PriceBar[]): Promise<AiResult<PatternDetectionResult>> {
  const payload = JSON.stringify({
    stockSymbol: symbol,
    priceHistory: bars.slice(-30).map((b) => ({
      date: b.date,
      open: Number(b.open.toFixed(2)),
      high: Number(b.high.toFixed(2)),
      low: Number(b.low.toFixed(2)),
      close: Number(b.close.toFixed(2)),
    })),
  });
  return sendStructuredPrompt<PatternDetectionResult>(buildPatternDetectionPrompt(), payload);
}

export async function generateNarrative(
  scenarioType: ScenarioType,
  difficulty: Difficulty,
  portfolioContext?: string
): Promise<AiResult<NarrativeScenario>> {
  return sendStructuredPrompt<NarrativeScenario>(
    buildNarrativePrompt(scenarioType, difficulty, portfolioContext),
    'Generate the scenario now.'
  );
}
