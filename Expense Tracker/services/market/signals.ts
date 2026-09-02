import { tickerOf } from '@/constants/tickers';
import type { DirectionCall, ForecastBand, Headline, PriceBar, SentimentSignal } from '@/types/stock';
import { todayStr } from '@/utils/date';
import { hashString, mulberry32 } from '@/utils/prng';

// All signals below are derived client-side from the mock price series —
// there is no forecasting microservice and no external sentiment API. This
// keeps the "predict" and "teach" halves of the app fully local/offline.

function movingAverage(bars: PriceBar[], window: number): number {
  const slice = bars.slice(Math.max(0, bars.length - window));
  return slice.reduce((s, b) => s + b.close, 0) / slice.length;
}

export function computeDirectionCall(symbol: string, bars: PriceBar[], horizonDays = 7): DirectionCall {
  const shortMA = movingAverage(bars, 5);
  const longMA = movingAverage(bars, 20);
  const last = bars[bars.length - 1].close;
  const weekAgo = bars[Math.max(0, bars.length - 6)].close;
  const momentumPct = weekAgo ? ((last - weekAgo) / weekAgo) * 100 : 0;
  const maSpreadPct = longMA ? ((shortMA - longMA) / longMA) * 100 : 0;

  let direction: DirectionCall['direction'] = 'flat';
  if (maSpreadPct > 0.3 && momentumPct > 0.4) direction = 'up';
  else if (maSpreadPct < -0.3 && momentumPct < -0.4) direction = 'down';

  const magnitude = Math.abs(maSpreadPct) / 4 + Math.abs(momentumPct) / 12;
  // For a trending call, confidence rises with the magnitude of the signal.
  // For a flat call, it's the opposite: confidence is highest when the signal
  // is closest to zero (a clean non-trend), not when it's merely below the
  // classification threshold.
  const confidence =
    direction === 'flat'
      ? Math.min(0.9, Math.max(0.35, 1 - magnitude))
      : Math.min(0.95, Math.max(0.32, magnitude));

  const name = tickerOf(symbol)?.name ?? symbol;
  let reason: string;
  if (direction === 'up') {
    reason = `${name}'s 5-day average is running above its 20-day trend, and price is up ${momentumPct.toFixed(1)}% over the last week.`;
  } else if (direction === 'down') {
    reason = `${name}'s short-term average has slipped below its 20-day trend, with price down ${Math.abs(momentumPct).toFixed(1)}% over the last week.`;
  } else {
    reason = `${name} is trading within a tight range — the 5-day and 20-day averages are close together with no clear trend.`;
  }

  return { direction, confidence, reason, horizonDays };
}

export function computeForecastBand(bars: PriceBar[], horizonDays = 7): ForecastBand {
  const returns: number[] = [];
  const window = bars.slice(Math.max(0, bars.length - 30));
  for (let i = 1; i < window.length; i++) {
    returns.push((window[i].close - window[i - 1].close) / window[i - 1].close);
  }
  const meanReturn = returns.reduce((s, r) => s + r, 0) / (returns.length || 1);
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (returns.length || 1);
  const dailyStdev = Math.sqrt(variance);

  const last = bars[bars.length - 1].close;
  const drift = meanReturn * horizonDays;
  const horizonStdev = dailyStdev * Math.sqrt(horizonDays);

  const mid = last * (1 + drift);
  const z = 1.28; // ~80% confidence interval
  const low = mid * (1 - z * horizonStdev);
  const high = mid * (1 + z * horizonStdev);

  return { horizonDays, low, mid, high };
}

const POSITIVE_TEMPLATES = [
  '{name} shares climb as analysts raise price targets',
  '{name} beats quarterly expectations, guidance raised',
  'Institutional investors increase stake in {name}',
  '{name} announces new product line, investors optimistic',
  "Analysts upgrade {name} to 'Buy' citing strong fundamentals",
];
const NEGATIVE_TEMPLATES = [
  '{name} shares slide on supply-chain concerns',
  '{name} misses revenue estimates for the quarter',
  '{name} downgraded by analysts amid slowing growth',
  '{name} faces regulatory scrutiny over recent practices',
  'Investors pull back on {name} amid sector-wide weakness',
];
const NEUTRAL_TEMPLATES = [
  '{name} trades sideways ahead of earnings report',
  '{name} holds steady as market awaits Fed decision',
  '{name} in-line with sector performance this week',
  "Analysts maintain a 'Hold' rating on {name}",
];

function fill(template: string, name: string): string {
  return template.replace('{name}', name);
}

export function computeSentiment(symbol: string, bars: PriceBar[], dateKey = todayStr()): SentimentSignal {
  const name = tickerOf(symbol)?.name ?? symbol;
  const rand = mulberry32(hashString(`${symbol}:${dateKey}`));

  const last = bars[bars.length - 1].close;
  const weekAgo = bars[Math.max(0, bars.length - 6)].close;
  const momentumPct = weekAgo ? ((last - weekAgo) / weekAgo) * 100 : 0;

  // Score leans with recent momentum, plus some day-to-day noise.
  const noise = (rand() - 0.5) * 40;
  const score = Math.max(-100, Math.min(100, momentumPct * 9 + noise));

  const label: SentimentSignal['label'] = score > 15 ? 'Bullish' : score < -15 ? 'Bearish' : 'Neutral';

  const pool = score > 15 ? POSITIVE_TEMPLATES : score < -15 ? NEGATIVE_TEMPLATES : NEUTRAL_TEMPLATES;
  const secondaryPool = score > 15 ? NEUTRAL_TEMPLATES : score < -15 ? NEUTRAL_TEMPLATES : POSITIVE_TEMPLATES;

  const shuffledPool = [...pool].sort(() => rand() - 0.5);
  const shuffledSecondary = [...secondaryPool].sort(() => rand() - 0.5);
  const tone: Headline['tone'] = score > 15 ? 'positive' : score < -15 ? 'negative' : 'neutral';
  const secondaryTone: Headline['tone'] = tone === 'neutral' ? 'positive' : 'neutral';

  const headlines: Headline[] = [
    { title: fill(shuffledPool[0], name), tone },
    { title: fill(shuffledPool[1] ?? shuffledPool[0], name), tone },
    { title: fill(shuffledSecondary[0], name), tone: secondaryTone },
  ];

  return { score, label, headlines };
}
