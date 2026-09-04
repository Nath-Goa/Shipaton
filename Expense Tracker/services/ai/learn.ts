import { sendChatMessage, sendStructuredPrompt } from '@/services/ai/client';
import {
  buildFlashcardsPrompt,
  buildNarrativePrompt,
  buildPatternDetectionPrompt,
  buildQuizPrompt,
  buildTradeReflectionPrompt,
} from '@/services/ai/prompts';
import type { AiResult } from '@/types/ai';
import type { Flashcard } from '@/types/flashcard';
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

const AI_FLASHCARD_BATCH_SIZE = 5;

export async function generateFlashcards(topicLabel: string): Promise<AiResult<{ cards: Flashcard[] }>> {
  return sendStructuredPrompt<{ cards: Flashcard[] }>(
    buildFlashcardsPrompt(topicLabel, AI_FLASHCARD_BATCH_SIZE),
    'Generate the flashcards now.'
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

// Tap-to-explain on a stock chart — a focused single-turn question about
// one specific point, with a small window of surrounding bars for context.
export async function explainChartPoint(symbol: string, bars: PriceBar[], index: number): Promise<AiResult<string>> {
  const window = bars.slice(Math.max(0, index - 5), index + 1);
  const payload = window
    .map((b) => `${b.date}: open ${b.open.toFixed(2)}, close ${b.close.toFixed(2)}`)
    .join('\n');
  const target = bars[index];
  const systemPrompt = [
    'You are a stock-chart tutor inside a mock-trading education app. The user tapped one specific point on a price chart.',
    `Explain in 2-3 short, plain-English sentences what the price did around ${target.date} for ${symbol}, based only on the data given — trend, direction, or a notable move.`,
    'This is simulated price data, not real market history — never claim to know a real news event caused it; describe the price action itself.',
    'Respond with plain text only, 2-3 sentences, no markdown, no JSON.',
  ].join(' ');
  return sendChatMessage(systemPrompt, [{ role: 'user', text: `Recent bars leading up to the tapped point:\n${payload}` }]);
}

export async function generateTradeReflection(params: {
  symbol: string;
  gainPct: number;
  heldMs: number;
}): Promise<AiResult<string>> {
  const heldMinutes = Math.max(1, Math.round(params.heldMs / 60000));
  const userPrompt = `Symbol: ${params.symbol}. Held for about ${heldMinutes} minute(s). Result: ${params.gainPct.toFixed(1)}% loss.`;
  return sendChatMessage(buildTradeReflectionPrompt(), [{ role: 'user', text: userPrompt }]);
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
