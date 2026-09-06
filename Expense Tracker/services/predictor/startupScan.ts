import { TICKERS } from '@/constants/tickers';
import { getFullHistory } from '@/services/marketData/marketData';
import { fetchHeadlines } from '@/services/news/newsFeed';
import { aggregateSentiment } from '@/services/news/sentiment';
import { HORIZON_DAYS } from '@/services/predictor/config';
import { currentFeatures, invalidateUniverseCache, predict } from '@/services/predictor/predictor';
import { usePredictorStore } from '@/store/usePredictorStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { NewsSentiment } from '@/types/prediction';

// Runs once per app open: resolve any predictions whose horizon has elapsed
// (which is what trains the model), then scan headlines and log fresh
// predictions for the symbols this user actually cares about.
//
// Scoped deliberately: watchlist + held positions, capped, rather than all
// 27 tickers. News is one HTTP request per symbol against the same endpoint
// the price data uses, and hammering it on every cold start is exactly the
// pattern that got live prices rate-limited into permanent mock data before.

const MAX_SYMBOLS_PER_SCAN = 6;
const NEWS_SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Strictly sequential, never concurrent — mirrored by services/news/marketNews.ts.
const REQUEST_SPACING_MS = 180;

const sentimentCache = new Map<string, { at: number; sentiment: NewsSentiment }>();
const SENTIMENT_TTL_MS = 6 * 60 * 60 * 1000;

function priceAtHorizon(symbol: string, predictionDate: string): number | null {
  const bars = getFullHistory(symbol);
  let predictionIndex = -1;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].date <= predictionDate) {
      predictionIndex = i;
      break;
    }
  }
  if (predictionIndex < 0) return null;
  const target = bars[predictionIndex + HORIZON_DAYS];
  return target && target.close > 0 ? target.close : null;
}

export function cachedSentiment(symbol: string): NewsSentiment | null {
  const entry = sentimentCache.get(symbol);
  if (!entry || Date.now() - entry.at > SENTIMENT_TTL_MS) return null;
  return entry.sentiment;
}

/** Fetches headlines for one symbol and caches the aggregate sentiment. */
export async function scanSymbolNews(symbol: string): Promise<NewsSentiment | null> {
  const cached = cachedSentiment(symbol);
  if (cached) return cached;
  const headlines = await fetchHeadlines(symbol);
  if (headlines.length === 0) return null;
  const sentiment = aggregateSentiment(headlines);
  sentimentCache.set(symbol, { at: Date.now(), sentiment });
  return sentiment;
}

function symbolsToScan(): string[] {
  const state = usePortfolioStore.getState();
  const active = state.portfolios[state.activePortfolioId];
  const held = active ? Object.keys(active.holdings ?? {}) : [];
  const ordered = [...new Set([...held, ...(state.watchlist ?? [])])];
  // Fall back to the largest names so a brand-new install still collects
  // training data instead of sitting idle until the user picks favourites.
  if (ordered.length === 0) return TICKERS.slice(0, 3).map((t) => t.symbol);
  return ordered.slice(0, MAX_SYMBOLS_PER_SCAN);
}

/**
 * The whole app-open routine. Safe to call unconditionally: it resolves
 * cheaply and skips the network entirely if news was scanned recently.
 */
export async function runStartupScan(): Promise<{ resolved: number; scanned: number; healthy: boolean }> {
  const store = usePredictorStore.getState();

  // Bars may have been refreshed since the last run; the market context is
  // derived from them, so it has to be rebuilt before anything is predicted.
  invalidateUniverseCache();

  // Data collection is opt-out (asked during onboarding). With it off the
  // model still runs exactly as shipped — it just never records a call or
  // learns from one, so there is nothing to resolve and nothing to drift.
  const collecting = useSettingsStore.getState().predictorDataCollection;

  const resolved = collecting
    ? store.resolvePending((entry) =>
        priceAtHorizon(
          entry.symbol,
          entry.priceDateAtPrediction ?? new Date(entry.createdAt).toISOString().slice(0, 10)
        )
      )
    : 0;

  // Integrity check runs after resolution, because resolution is the only
  // thing that can have changed the weights since the last launch.
  const health = usePredictorStore.getState().checkHealth();
  if (health.status === 'degraded') {
    return { resolved, scanned: 0, healthy: false };
  }

  if (!collecting || Date.now() - store.lastNewsScanAt < NEWS_SCAN_INTERVAL_MS) {
    return { resolved, scanned: 0, healthy: true };
  }

  let scanned = 0;
  for (const symbol of symbolsToScan()) {
    const sentiment = await scanSymbolNews(symbol);
    scanned += 1;

    const snapshot = currentFeatures(symbol);
    if (snapshot) {
      const prediction = predict({ symbol, model: usePredictorStore.getState().model, news: sentiment });
      if (prediction) {
        usePredictorStore.getState().recordPrediction({
          symbol,
          createdAt: Date.now(),
          priceDateAtPrediction: snapshot.priceDate,
          priceAtPrediction: snapshot.price,
          probabilityUp: prediction.probabilityUp,
          features: snapshot.features,
        });
      }
    }
    await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS));
  }

  usePredictorStore.getState().markNewsScanned();
  return { resolved, scanned, healthy: true };
}
