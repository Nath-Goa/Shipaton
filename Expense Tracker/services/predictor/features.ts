// Feature extraction for the price-direction model.
//
// Deliberately dependency-free (its own structural Bar type rather than an
// import) so the whole predictor core can be bundled and evaluated in plain
// Node against real market data — see scripts/evaluate-predictor.ts. Nothing
// here may reach forward in time: every feature at index `i` reads only
// bars[0..i], which is what makes the walk-forward evaluation honest rather
// than a lookahead-leaking fantasy.

export type Bar = { date: string; open: number; high: number; low: number; close: number };

// Every feature is scale-free (a ratio, a z-score, or a fraction) so a $27
// stock and a $590 stock land on the same footing and one model can be
// pooled across the whole universe.
export const FEATURE_NAMES = [
  'ret1',
  'ret5',
  'ret10',
  'ret20',
  'ret60',
  'sma5over20',
  'sma20over50',
  'pxOverSma50',
  'rsi14',
  'macdHist',
  'bollingerZ',
  'vol20',
  'volRatio',
  'rangePct5',
  'trendQuality',
  'drawdown60',
  'upDayFrac20',
  'gapMean5',
  'relStrength20',
  'mom12m1m',
  'dist52wHigh',
  'volScaledMom',
  'relStrength60',
  // Market-state features. Shared by every symbol on a given date, and
  // that's the point: a single stock's absolute direction is dominated by
  // what the whole market does next, so a model without these is being
  // asked to predict the tide from one boat.
  'mktRet20',
  'mktRet60',
  'mktVsSma200',
  'mktVol20',
  'mktDrawdown',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export const FEATURE_COUNT = FEATURE_NAMES.length;

// Driven by the longest lookback: 12-month momentum needs a full 252-session
// year behind it. Costly in samples, but 12-1 momentum and distance-from-
// 52-week-high are the two most durable cross-sectional equity signals in
// the literature, and dropping them to save a year of warmup measurably hurt
// out-of-sample AUC.
export const MIN_HISTORY = 258;
const YEAR_SESSIONS = 252;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

function stdev(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (const v of values) sum += (v - avg) ** 2;
  return Math.sqrt(sum / (values.length - 1));
}

function pctChange(from: number, to: number): number {
  if (!(from > 0)) return 0;
  return to / from - 1;
}

function sma(bars: Bar[], end: number, period: number): number {
  const start = end - period + 1;
  if (start < 0) return bars[end].close;
  let total = 0;
  for (let i = start; i <= end; i++) total += bars[i].close;
  return total / period;
}

function ema(bars: Bar[], end: number, period: number): number {
  // Seeded with an SMA over the first `period` bars of the window, then run
  // forward — a bare recursive EMA from bar 0 is dominated by its own
  // arbitrary seed for the first several periods.
  const window = Math.min(end + 1, period * 4);
  const start = end - window + 1;
  const k = 2 / (period + 1);
  let value = 0;
  let seeded = 0;
  for (let i = start; i <= end; i++) {
    if (seeded < period) {
      value += bars[i].close;
      seeded += 1;
      if (seeded === period) value /= period;
      continue;
    }
    value = bars[i].close * k + value * (1 - k);
  }
  if (seeded < period) return value / Math.max(1, seeded);
  return value;
}

function rsi(bars: Bar[], end: number, period = 14): number {
  const start = end - period + 1;
  if (start < 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = start; i <= end; i++) {
    const delta = bars[i].close - bars[i - 1].close;
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function dailyReturns(bars: Bar[], end: number, period: number): number[] {
  const out: number[] = [];
  const start = Math.max(1, end - period + 1);
  for (let i = start; i <= end; i++) {
    out.push(pctChange(bars[i - 1].close, bars[i].close));
  }
  return out;
}

// Signed R² of a least-squares fit on log price over `period` bars: how
// *cleanly* the stock is trending, not just how far it moved. A grinding
// steady advance and a violent whipsaw can share the same 20-day return;
// this separates them, and the sign carries the direction.
function trendQuality(bars: Bar[], end: number, period = 20): number {
  const start = end - period + 1;
  if (start < 0) return 0;
  const n = period;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = start; i <= end; i++) {
    if (!(bars[i].close > 0)) return 0;
    xs.push(i - start);
    ys.push(Math.log(bars[i].close));
  }
  const xBar = mean(xs);
  const yBar = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xBar;
    const dy = ys[i] - yBar;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  const r2 = (sxy * sxy) / (sxx * syy);
  const slope = sxy / sxx;
  return slope >= 0 ? r2 : -r2;
}

/** Cross-sectional averages plus the state of the market itself, per date. */
export type UniverseContext = {
  ret20: number;
  ret60: number;
  mktRet20: number;
  mktRet60: number;
  mktVsSma200: number;
  mktVol20: number;
  mktDrawdown: number;
};

export const EMPTY_UNIVERSE: UniverseContext = {
  ret20: 0,
  ret60: 0,
  mktRet20: 0,
  mktRet60: 0,
  mktVsSma200: 0,
  mktVol20: 0,
  mktDrawdown: 0,
};

/**
 * Features for the bar at `index`, using only data at or before it.
 * `universe` carries the mean return across the whole tracked universe on
 * this date — it turns absolute momentum reads into relative ones, which is
 * the most useful thing a cross-sectional model gets that a single-symbol
 * model cannot see.
 * Returns null when the window is too short or the data is unusable.
 */
export function extractFeatures(
  bars: Bar[],
  index: number,
  universe: UniverseContext = EMPTY_UNIVERSE
): number[] | null {
  if (index < MIN_HISTORY || index >= bars.length) return null;
  const close = bars[index].close;
  if (!(close > 0)) return null;

  const sma5 = sma(bars, index, 5);
  const sma20 = sma(bars, index, 20);
  const sma50 = sma(bars, index, 50);
  const ret20 = pctChange(bars[index - 20].close, close);

  const rets20 = dailyReturns(bars, index, 20);
  const rets5 = dailyReturns(bars, index, 5);
  const mean20 = mean(rets20);
  const vol20 = stdev(rets20, mean20);
  const vol5 = stdev(rets5, mean(rets5));

  const closes20: number[] = [];
  for (let i = index - 19; i <= index; i++) closes20.push(bars[i].close);
  const closeMean20 = mean(closes20);
  const closeStd20 = stdev(closes20, closeMean20);

  let rangeSum = 0;
  for (let i = index - 4; i <= index; i++) {
    rangeSum += bars[i].close > 0 ? (bars[i].high - bars[i].low) / bars[i].close : 0;
  }

  let high60 = 0;
  for (let i = index - 59; i <= index; i++) high60 = Math.max(high60, bars[i].close);

  let upDays = 0;
  for (const r of rets20) if (r > 0) upDays += 1;

  let gapSum = 0;
  for (let i = index - 4; i <= index; i++) gapSum += pctChange(bars[i - 1].close, bars[i].open);

  const macd = ema(bars, index, 12) - ema(bars, index, 26);
  // Signal line approximated on the same window rather than kept as running
  // state — the model only ever sees one bar at a time in production, so a
  // stateless form keeps live and backtest values identical.
  let signal = 0;
  const signalSpan = 9;
  for (let k = 0; k < signalSpan; k++) {
    const j = index - k;
    if (j < MIN_HISTORY) break;
    signal += ema(bars, j, 12) - ema(bars, j, 26);
  }
  signal /= signalSpan;

  const ret60 = pctChange(bars[index - 60].close, close);

  // 12-1 momentum: the classic cross-sectional momentum factor, measured to
  // one month ago rather than to today so it isn't contaminated by the
  // short-term reversal effect that dominates the most recent weeks.
  const mom12m1m = pctChange(bars[index - YEAR_SESSIONS].close, bars[index - 21].close);

  let high52w = 0;
  for (let i = index - YEAR_SESSIONS + 1; i <= index; i++) high52w = Math.max(high52w, bars[i].close);

  const features = [
    pctChange(bars[index - 1].close, close),
    pctChange(bars[index - 5].close, close),
    pctChange(bars[index - 10].close, close),
    ret20,
    ret60,
    sma20 > 0 ? sma5 / sma20 - 1 : 0,
    sma50 > 0 ? sma20 / sma50 - 1 : 0,
    sma50 > 0 ? close / sma50 - 1 : 0,
    (rsi(bars, index) - 50) / 50,
    (macd - signal) / close,
    closeStd20 > 0 ? (close - closeMean20) / closeStd20 : 0,
    vol20,
    vol20 > 0 ? vol5 / vol20 - 1 : 0,
    rangeSum / 5,
    trendQuality(bars, index),
    high60 > 0 ? close / high60 - 1 : 0,
    upDays / Math.max(1, rets20.length) - 0.5,
    gapSum / 5,
    ret20 - universe.ret20,
    mom12m1m,
    high52w > 0 ? close / high52w - 1 : 0,
    // Risk-adjusted momentum: the same 20-day move means something very
    // different on a quiet stock than on a violent one.
    vol20 > 1e-6 ? ret20 / (vol20 * Math.sqrt(20)) : 0,
    ret60 - universe.ret60,
    universe.mktRet20,
    universe.mktRet60,
    universe.mktVsSma200,
    universe.mktVol20,
    universe.mktDrawdown,
  ];

  for (const value of features) {
    if (!Number.isFinite(value)) return null;
  }
  return features;
}

/**
 * Per-date market context: cross-sectional averages, plus the state of an
 * equal-weighted index synthesised from the universe itself.
 *
 * The index is chained from mean *daily returns* rather than averaging
 * prices — that stays correct when symbols enter or leave the sample on
 * different dates, where a price average would jump discontinuously.
 */
export function buildUniverseContext(barsBySymbol: Map<string, Bar[]>): Map<string, UniverseContext> {
  const acc = new Map<string, { s20: number; n20: number; s60: number; n60: number; sd: number; nd: number }>();
  for (const bars of barsBySymbol.values()) {
    for (let i = 1; i < bars.length; i++) {
      const entry = acc.get(bars[i].date) ?? { s20: 0, n20: 0, s60: 0, n60: 0, sd: 0, nd: 0 };
      const daily = pctChange(bars[i - 1].close, bars[i].close);
      if (Number.isFinite(daily)) {
        entry.sd += daily;
        entry.nd += 1;
      }
      if (i >= 20) {
        const r20 = pctChange(bars[i - 20].close, bars[i].close);
        if (Number.isFinite(r20)) {
          entry.s20 += r20;
          entry.n20 += 1;
        }
      }
      if (i >= 60) {
        const r60 = pctChange(bars[i - 60].close, bars[i].close);
        if (Number.isFinite(r60)) {
          entry.s60 += r60;
          entry.n60 += 1;
        }
      }
      acc.set(bars[i].date, entry);
    }
  }

  const dates = [...acc.keys()].sort();
  const level: number[] = [];
  const dailyRet: number[] = [];
  let current = 100;
  for (const date of dates) {
    const e = acc.get(date)!;
    const r = e.nd ? e.sd / e.nd : 0;
    current *= 1 + r;
    level.push(current);
    dailyRet.push(r);
  }

  const out = new Map<string, UniverseContext>();
  for (let i = 0; i < dates.length; i++) {
    const e = acc.get(dates[i])!;

    let sma200 = 0;
    const smaStart = Math.max(0, i - 199);
    for (let j = smaStart; j <= i; j++) sma200 += level[j];
    sma200 /= i - smaStart + 1;

    const volStart = Math.max(0, i - 19);
    const window = dailyRet.slice(volStart, i + 1);
    const avg = mean(window);
    const mktVol20 = stdev(window, avg);

    let peak = 0;
    const peakStart = Math.max(0, i - YEAR_SESSIONS + 1);
    for (let j = peakStart; j <= i; j++) peak = Math.max(peak, level[j]);

    out.set(dates[i], {
      ret20: e.n20 ? e.s20 / e.n20 : 0,
      ret60: e.n60 ? e.s60 / e.n60 : 0,
      mktRet20: i >= 20 ? level[i] / level[i - 20] - 1 : 0,
      mktRet60: i >= 60 ? level[i] / level[i - 60] - 1 : 0,
      mktVsSma200: sma200 > 0 ? level[i] / sma200 - 1 : 0,
      mktVol20,
      mktDrawdown: peak > 0 ? level[i] / peak - 1 : 0,
    });
  }
  return out;
}
