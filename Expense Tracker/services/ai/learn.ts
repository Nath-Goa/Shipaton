import { sendChatMessage, sendStructuredPrompt } from '@/services/ai/client';
import {
  buildFlashcardsPrompt,
  buildNarrativePrompt,
  buildPatternDetectionPrompt,
  buildQuizPrompt,
  buildTopicStoryPrompt,
  buildTradeReflectionPrompt,
} from '@/services/ai/prompts';
import type { AiResult } from '@/types/ai';
import type { Flashcard } from '@/types/flashcard';
import type { ScenarioType, NarrativeScenario, TopicStory } from '@/types/narrative';
import type { PatternDetectionResult } from '@/types/pattern';
import type { PriceBar } from '@/types/stock';
import type { Difficulty, QuizQuestion } from '@/types/quiz';
import type { NewsItem } from '@/types/prediction';

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

// A short plain-English gloss on one real headline, so the app itself
// answers "why does this matter" without sending the user to the source
// article. Deliberately never run for a whole feed at once (that would burn
// the shared AI_FEATURE_DAILY_LIMIT across dozens of headlines at a time) —
// every call site instead triggers this for exactly one headline at a time
// (the single focused card in the News tab's one-at-a-time feed, or the
// single active candidate in the product scanner), which keeps the cost
// identical to the old on-demand button, just without the extra tap.
export async function explainHeadline(item: NewsItem): Promise<AiResult<string>> {
  const systemPrompt = [
    'You are a finance news explainer inside an educational trading app.',
    'The user is looking at one real headline and wants a quick, plain-English gloss.',
    `Headline: "${item.title}" (source: ${item.publisher})`,
    'In 2-3 short sentences, explain what this headline likely means and why someone learning about investing might care — based only on the headline itself, not invented details you cannot know from it.',
    'If the headline is ambiguous or you genuinely cannot infer much, say so plainly rather than guessing specifics.',
    'Respond with plain text only, 2-3 sentences, no markdown, no JSON.',
  ].join(' ');
  return sendChatMessage(systemPrompt, [{ role: 'user', text: 'Explain this headline.' }]);
}

// Module-wide cache keyed by headline id, shared by every call site
// (News tab, product scanner) so the same real-world headline is never
// re-summarized twice even if it shows up in two places at once, and
// re-visiting an already-explained card never re-spends quota.
const headlineExplanationCache = new Map<string, string>();

export function getCachedHeadlineExplanation(item: NewsItem): string | null {
  return headlineExplanationCache.get(item.id) ?? null;
}

export async function explainHeadlineCached(item: NewsItem): Promise<AiResult<string>> {
  const cached = headlineExplanationCache.get(item.id);
  if (cached) return { ok: true, data: cached };
  const result = await explainHeadline(item);
  if (result.ok) headlineExplanationCache.set(item.id, result.data);
  return result;
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

// Learn tab's storytelling lesson mode (lesson.tsx) — one story per course,
// cached by the caller (component state) so switching modes back and forth
// doesn't regenerate/re-spend quota. See buildTopicStoryPrompt for why this
// is a plain story, not the branching-options shape generateNarrative uses.
export async function generateTopicStory(courseTitle: string, summary: string): Promise<AiResult<TopicStory>> {
  return sendStructuredPrompt<TopicStory>(buildTopicStoryPrompt(courseTitle, summary), 'Write the story now.');
}
