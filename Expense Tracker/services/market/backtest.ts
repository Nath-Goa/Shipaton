import { computeDirectionCall, FLAT_BAND_PCT } from '@/services/market/signals';
import { getFullHistory } from '@/services/marketData/marketData';
import type { Direction } from '@/types/stock';

// Max-tier feature: walks the mock price history day by day, re-running the
// same direction-call algorithm real screens use with only the data that
// would've been available at that point, then checks it against what
// actually happened `horizonDays` later. Purely a client-side replay over
// already-generated mock data — no new data source involved.
//
// FLAT_BAND_PCT is imported from signals.ts rather than kept as a local
// copy: it's the ground-truth definition of up/down/flat, and the thing
// making calls and the thing grading them must never be able to drift out
// of sync with each other.

export type BacktestBucket = { predicted: number; correct: number };

export type BacktestResult = {
  symbol: string;
  horizonDays: number;
  sampleSize: number;
  hits: number;
  accuracyPct: number;
  byDirection: Record<Direction, BacktestBucket>;
};

// A short burn-in before the volatility estimate behind computeDirectionCall's
// confidence has enough history to be meaningful — direction itself only
// needs horizonDays of runway, but this keeps the earliest few calls from
// being graded off a near-empty volatility sample.
const MIN_WINDOW = 25;

export function runBacktest(symbol: string, horizonDays: number): BacktestResult {
  const bars = getFullHistory(symbol);
  const byDirection: Record<Direction, BacktestBucket> = {
    up: { predicted: 0, correct: 0 },
    down: { predicted: 0, correct: 0 },
    flat: { predicted: 0, correct: 0 },
  };

  let hits = 0;
  let sampleSize = 0;

  for (let i = MIN_WINDOW; i <= bars.length - 1 - horizonDays; i++) {
    const windowBars = bars.slice(0, i + 1);
    const call = computeDirectionCall(symbol, windowBars, horizonDays);

    const startClose = bars[i].close;
    const endClose = bars[i + horizonDays].close;
    const actualPct = startClose ? ((endClose - startClose) / startClose) * 100 : 0;
    const actual: Direction = actualPct > FLAT_BAND_PCT ? 'up' : actualPct < -FLAT_BAND_PCT ? 'down' : 'flat';

    sampleSize++;
    byDirection[call.direction].predicted++;
    if (call.direction === actual) {
      hits++;
      byDirection[call.direction].correct++;
    }
  }

  return {
    symbol,
    horizonDays,
    sampleSize,
    hits,
    accuracyPct: sampleSize ? (hits / sampleSize) * 100 : 0,
    byDirection,
  };
}
