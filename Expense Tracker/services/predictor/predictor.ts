import { TICKERS } from '@/constants/tickers';
import { getFullHistory } from '@/services/marketData/marketData';
import { CONFIDENCE_THRESHOLD, HORIZON_DAYS, MAX_DISPLAYED_CONFIDENCE } from '@/services/predictor/config';
import {
  buildUniverseContext,
  extractFeatures,
  FEATURE_NAMES,
  MIN_HISTORY,
  type Bar,
} from '@/services/predictor/features';
import { predictProba, type Model } from '@/services/predictor/model';
import type { NewsSentiment, Prediction } from '@/types/prediction';

// Runs the trained model against live cached bars, on device, synchronously.
//
// The market context has to be built from the whole ticker universe rather
// than the one symbol being viewed — five of the features describe the
// market's own state, and they were fitted that way. Rebuilding it per call
// would be wasteful, so it's cached for a short window and invalidated by
// the date rolling over.

let universeCache: { builtAt: number; context: ReturnType<typeof buildUniverseContext> } | null = null;
const UNIVERSE_TTL_MS = 10 * 60 * 1000;

function universeContext() {
  if (universeCache && Date.now() - universeCache.builtAt < UNIVERSE_TTL_MS) return universeCache.context;
  const bars = new Map<string, Bar[]>();
  for (const ticker of TICKERS) {
    const history = getFullHistory(ticker.symbol);
    if (history.length > 0) bars.set(ticker.symbol, history);
  }
  const context = buildUniverseContext(bars);
  universeCache = { builtAt: Date.now(), context };
  return context;
}

export function invalidateUniverseCache(): void {
  universeCache = null;
}

// Plain-English names for the features, so a call can explain itself instead
// of asserting a number at someone who has no way to check it.
const FEATURE_LABELS: Record<string, string> = {
  ret1: 'yesterday’s move',
  ret5: '1-week move',
  ret10: '2-week move',
  ret20: '1-month move',
  ret60: '3-month move',
  sma5over20: 'short vs medium average',
  sma20over50: 'medium vs long average',
  pxOverSma50: 'price vs 50-day average',
  rsi14: 'RSI (overbought/oversold)',
  macdHist: 'MACD momentum',
  bollingerZ: 'stretch from its 20-day mean',
  vol20: 'recent volatility',
  volRatio: 'volatility picking up or calming',
  rangePct5: 'daily trading range',
  trendQuality: 'how clean the trend is',
  drawdown60: 'distance below its 3-month high',
  upDayFrac20: 'share of up days lately',
  gapMean5: 'overnight gaps',
  relStrength20: 'strength vs other stocks (1 month)',
  mom12m1m: '12-month momentum',
  dist52wHigh: 'distance from its 52-week high',
  volScaledMom: 'risk-adjusted momentum',
  relStrength60: 'strength vs other stocks (3 months)',
  mktRet20: 'market’s 1-month move',
  mktRet60: 'market’s 3-month move',
  mktVsSma200: 'market vs its 200-day average',
  mktVol20: 'market volatility',
  mktDrawdown: 'market’s distance below its high',
};

// News moves the probability, but only within a hard cap. The price model is
// calibrated against a measured holdout; the headline adjustment is not, so
// it is allowed to tilt a call and never to create one on its own.
const MAX_NEWS_ADJUSTMENT = 0.04;

export function newsAdjustment(news: NewsSentiment | null): number {
  if (!news || news.scoredCount === 0) return 0;
  // Confidence in the sentiment scales with how many headlines actually
  // carried signal — one opinionated headline is an anecdote, six is a mood.
  const depth = Math.min(1, news.scoredCount / 5);
  return news.score * depth * MAX_NEWS_ADJUSTMENT;
}

export type PredictInput = {
  symbol: string;
  model: Model;
  news?: NewsSentiment | null;
};

/** Null when there isn't enough history to form an honest opinion. */
export function predict({ symbol, model, news = null }: PredictInput): Prediction | null {
  const bars = getFullHistory(symbol);
  if (bars.length <= MIN_HISTORY) return null;

  const index = bars.length - 1;
  const context = universeContext().get(bars[index].date);
  const features = extractFeatures(bars, index, context);
  if (!features) return null;

  const baseProbability = predictProba(model, features);
  const adjustment = newsAdjustment(news);
  const probabilityUp = Math.min(0.99, Math.max(0.01, baseProbability + adjustment));

  const confident = probabilityUp >= CONFIDENCE_THRESHOLD || probabilityUp <= 1 - CONFIDENCE_THRESHOLD;
  const direction = !confident ? 'unclear' : probabilityUp >= 0.5 ? 'up' : 'down';

  // Contribution of each feature to this specific call: its standardised
  // value times its weight, which is exactly its push on the log-odds.
  const drivers = features
    .map((value, i) => {
      const std = model.std[i] > 1e-9 ? model.std[i] : 1;
      const z = (value - model.mean[i]) / std;
      return {
        feature: FEATURE_NAMES[i],
        label: FEATURE_LABELS[FEATURE_NAMES[i]] ?? FEATURE_NAMES[i],
        contribution: z * model.weights[i],
      };
    })
    .filter((d) => Number.isFinite(d.contribution))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 4);

  return {
    symbol,
    probabilityUp,
    direction,
    confidence: Math.min(MAX_DISPLAYED_CONFIDENCE, Math.abs(probabilityUp - 0.5) * 2),
    horizonDays: HORIZON_DAYS,
    baseProbability,
    newsAdjustment: adjustment,
    news,
    drivers,
    createdAt: Date.now(),
  };
}

/** Current features for a symbol, stored so an outcome can train on them later. */
export function currentFeatures(symbol: string): { features: number[]; price: number } | null {
  const bars = getFullHistory(symbol);
  if (bars.length <= MIN_HISTORY) return null;
  const index = bars.length - 1;
  const features = extractFeatures(bars, index, universeContext().get(bars[index].date));
  if (!features) return null;
  return { features, price: bars[index].close };
}
