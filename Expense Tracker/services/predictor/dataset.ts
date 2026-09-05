import { HORIZON_DAYS } from '@/services/predictor/config';
import { buildUniverseContext, extractFeatures, MIN_HISTORY, type Bar } from '@/services/predictor/features';

export { HORIZON_DAYS };

// Turns raw per-symbol bars into a pooled, time-ordered training set.
//
// Pooled across the whole universe on purpose: one symbol alone yields a few
// hundred usable samples, which is far too few for a 23-feature model and
// would overfit instantly. Every symbol shares one model, and the features
// are all scale-free so that pooling is legitimate.

/**
 * 'absolute' — will this close higher than today?
 * 'relative' — will this beat the average stock in the universe?
 *
 * Relative is the default because it is dramatically more learnable, and the
 * reason is structural rather than a tuning accident: a single name's
 * absolute direction is dominated by the whole market's next move, which no
 * feature here can see. Subtracting the universe's own forward return
 * removes that common factor and leaves the part that actually depends on
 * this stock — measured, not assumed (see scripts/sweep-predictor.ts).
 */
export type LabelMode = 'absolute' | 'relative';

export type Sample = {
  date: string;
  symbol: string;
  x: number[];
  y: number;
  /** Actual forward return, kept for evaluation only — never a feature. */
  forwardReturn: number;
  /** Forward return minus the universe's, for relative-mode evaluation. */
  excessReturn: number;
};

export type DatasetOptions = {
  horizon?: number;
  labelMode?: LabelMode;
};

/**
 * The label reads forward by `horizon` sessions — the only place in this
 * file allowed to look past index `i`, and the reason every split downstream
 * has to be strictly time-ordered.
 */
export function buildDataset(barsBySymbol: Map<string, Bar[]>, options: DatasetOptions = {}): Sample[] {
  const horizon = options.horizon ?? HORIZON_DAYS;
  const labelMode = options.labelMode ?? 'relative';
  const universe = buildUniverseContext(barsBySymbol);

  // Mean forward return across the universe per date — the benchmark a
  // relative label is scored against.
  const forwardAcc = new Map<string, { sum: number; count: number }>();
  for (const bars of barsBySymbol.values()) {
    for (let i = 0; i < bars.length - horizon; i++) {
      const now = bars[i].close;
      const future = bars[i + horizon].close;
      if (!(now > 0) || !(future > 0)) continue;
      const entry = forwardAcc.get(bars[i].date) ?? { sum: 0, count: 0 };
      entry.sum += future / now - 1;
      entry.count += 1;
      forwardAcc.set(bars[i].date, entry);
    }
  }

  const samples: Sample[] = [];
  for (const [symbol, bars] of barsBySymbol) {
    for (let i = MIN_HISTORY; i < bars.length - horizon; i++) {
      const x = extractFeatures(bars, i, universe.get(bars[i].date));
      if (!x) continue;
      const now = bars[i].close;
      const future = bars[i + horizon].close;
      if (!(now > 0) || !(future > 0)) continue;
      const forwardReturn = future / now - 1;
      const fwd = forwardAcc.get(bars[i].date);
      // A one-symbol date has no meaningful benchmark to be relative to.
      if (labelMode === 'relative' && (!fwd || fwd.count < 5)) continue;
      const benchmark = fwd && fwd.count > 0 ? fwd.sum / fwd.count : 0;
      const excessReturn = forwardReturn - benchmark;
      const y = labelMode === 'relative' ? (excessReturn > 0 ? 1 : 0) : forwardReturn > 0 ? 1 : 0;
      samples.push({ date: bars[i].date, symbol, x, y, forwardReturn, excessReturn });
    }
  }

  samples.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return samples;
}

/**
 * Splits strictly by calendar date, never by row index: every training
 * sample predates every test sample. Samples whose label window straddles
 * the cutoff are dropped from training — without that embargo, a training
 * row's outcome would sit inside the test period, which is lookahead
 * leakage in its most easily-missed form.
 */
export function splitByDate(
  samples: Sample[],
  cutoffDate: string,
  horizon = HORIZON_DAYS
): { train: Sample[]; test: Sample[] } {
  const train: Sample[] = [];
  const test: Sample[] = [];
  // ~7 calendar days per 5 trading sessions, rounded up generously.
  const embargoMs = horizon * 2 * 24 * 60 * 60 * 1000;
  const cutoffMs = Date.parse(cutoffDate);
  for (const sample of samples) {
    if (sample.date >= cutoffDate) {
      test.push(sample);
      continue;
    }
    if (Date.parse(sample.date) + embargoMs < cutoffMs) train.push(sample);
  }
  return { train, test };
}
