import type { NewsItem, NewsSentiment } from '@/types/prediction';

// Lexicon sentiment tuned for financial headlines, scored on-device.
//
// Deliberately not an AI call: this runs for every watched symbol on every
// app open, which would burn the shared AI quota in a day and add seconds of
// latency to startup. A domain lexicon is also *auditable* — every score can
// be traced to the exact words that produced it, which matters when the
// output feeds a number shown to a beginner. General-purpose sentiment word
// lists are actively wrong here ("beat", "cut", "miss", "outstanding" all
// invert or change meaning in a markets context), so this list is
// finance-specific.

const POSITIVE: Record<string, number> = {
  beats: 2, beat: 2, tops: 2, topped: 2, surge: 2, surges: 2, surged: 2, soar: 2.5, soars: 2.5, soared: 2.5,
  rally: 1.5, rallies: 1.5, rallied: 1.5, jump: 1.5, jumps: 1.5, jumped: 1.5, climb: 1, climbs: 1, climbed: 1,
  gain: 1, gains: 1, gained: 1, rise: 1, rises: 1, rose: 1, upgrade: 2.5, upgrades: 2.5, upgraded: 2.5,
  outperform: 2, buy: 1.5, bullish: 2, record: 1.5, profit: 1.5, profits: 1.5, profitable: 1.5,
  growth: 1.5, strong: 1.5, stronger: 1.5, strength: 1.5, expands: 1, expansion: 1, approval: 2, approved: 2,
  wins: 1.5, won: 1.5, breakthrough: 2, dividend: 1, buyback: 1.5, raises: 1.5, raised: 1.5, boost: 1.5,
  boosts: 1.5, optimistic: 1.5, upbeat: 1.5, rebound: 1.5, recovery: 1.5, milestone: 1, partnership: 1,
  launch: 0.5, launches: 0.5, innovation: 1, demand: 1, momentum: 1, exceeds: 2, exceeded: 2,
};

const NEGATIVE: Record<string, number> = {
  miss: 2, misses: 2, missed: 2, plunge: 2.5, plunges: 2.5, plunged: 2.5, tumble: 2, tumbles: 2, tumbled: 2,
  slump: 2, slumps: 2, slumped: 2, sink: 1.5, sinks: 1.5, sank: 1.5, fall: 1, falls: 1, fell: 1,
  drop: 1, drops: 1, dropped: 1, decline: 1, declines: 1, declined: 1, downgrade: 2.5, downgrades: 2.5,
  downgraded: 2.5, underperform: 2, sell: 1.5, bearish: 2, loss: 1.5, losses: 1.5, weak: 1.5, weaker: 1.5,
  weakness: 1.5, warns: 2, warning: 2, cuts: 1.5, cut: 1.5, slashes: 2, slashed: 2, lawsuit: 2, sues: 2,
  probe: 2, investigation: 2, investigating: 2, recall: 2, fraud: 3, scandal: 3, bankruptcy: 3, default: 2.5,
  layoffs: 1.5, layoff: 1.5, fires: 1, resigns: 1.5, resignation: 1.5, delay: 1.5, delays: 1.5, delayed: 1.5,
  halt: 2, halted: 2, ban: 2, banned: 2, fine: 1.5, fined: 1.5, penalty: 1.5, concerns: 1, concern: 1,
  risk: 1, risks: 1, selloff: 2, crash: 2.5, slide: 1.5, slides: 1.5, struggles: 1.5, disappointing: 2,
  disappoints: 2, shortfall: 2, glut: 1.5, oversupply: 1.5, headwinds: 1.5, pressure: 1,
};

// Applied to the *next* scored word, so "not strong" and "beats expectations"
// vs "misses expectations" resolve correctly rather than by keyword presence.
const NEGATORS = new Set(['not', 'no', 'never', 'without', 'fails', 'fail', 'failed', 'unlikely']);
const INTENSIFIERS: Record<string, number> = {
  very: 1.4, sharply: 1.5, massively: 1.6, hugely: 1.5, significantly: 1.35, slightly: 0.6, modestly: 0.65,
  marginally: 0.55, record: 1.3, historic: 1.4,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s%$.-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Raw sentiment for one headline, roughly -1..1. */
export function scoreHeadline(title: string): number {
  const words = tokenize(title);
  let score = 0;
  let hits = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const positive = POSITIVE[word] ?? 0;
    const negative = NEGATIVE[word] ?? 0;
    if (positive === 0 && negative === 0) continue;

    let value = positive > 0 ? positive : -negative;
    const prev = words[i - 1];
    const prev2 = words[i - 2];
    if (prev && INTENSIFIERS[prev]) value *= INTENSIFIERS[prev];
    if ((prev && NEGATORS.has(prev)) || (prev2 && NEGATORS.has(prev2))) value *= -0.8;
    score += value;
    hits += 1;
  }
  if (hits === 0) return 0;
  // Squash so one loud headline can't dominate; keeps the range interpretable.
  return Math.tanh(score / 3);
}

const RECENCY_HALF_LIFE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Aggregate sentiment across a symbol's headlines, weighted toward recent
 * ones (3-day half-life). Returns a neutral, explicitly low-confidence
 * result when there's nothing usable to read.
 */
export function aggregateSentiment(items: NewsItem[], now = Date.now()): NewsSentiment {
  const scored = items
    .map((item) => ({ item, score: scoreHeadline(item.title) }))
    .filter((entry) => Number.isFinite(entry.score));

  const opinionated = scored.filter((entry) => entry.score !== 0);
  if (opinionated.length === 0) {
    return {
      score: 0,
      label: 'neutral',
      headlineCount: items.length,
      scoredCount: 0,
      topHeadlines: scored.slice(0, 3).map((entry) => ({ title: entry.item.title, score: entry.score })),
    };
  }

  let weighted = 0;
  let weight = 0;
  for (const entry of opinionated) {
    const ageMs = Math.max(0, now - entry.item.publishedAt);
    const w = Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
    weighted += entry.score * w;
    weight += w;
  }
  const score = weight > 0 ? weighted / weight : 0;

  return {
    score,
    label: score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral',
    headlineCount: items.length,
    scoredCount: opinionated.length,
    topHeadlines: [...opinionated]
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 3)
      .map((entry) => ({ title: entry.item.title, score: entry.score })),
  };
}
