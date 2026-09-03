import * as live from '@/services/marketData/liveMarketData';
import * as mock from '@/services/marketData/mockMarketData';
import { isLiveMarketDataConfigured } from '@/services/marketData/twelveData';
import type { PriceBar, Quote, Range } from '@/types/stock';

// Public entry point for stock price data — every screen imports from here,
// never from mockMarketData or liveMarketData directly. Dispatches to real
// prices (Twelve Data, via liveMarketData.ts) when
// EXPO_PUBLIC_TWELVEDATA_API_KEY is set, otherwise falls back to the fully
// local mock engine — same "configured vs. demo" pattern used for
// RevenueCat, Sentry, and the shared AI key elsewhere in this app.
export { isLiveMarketDataConfigured };

const engine = isLiveMarketDataConfigured() ? live : mock;

export function getFullHistory(symbol: string): PriceBar[] {
  return engine.getFullHistory(symbol);
}

export function getHistory(symbol: string, range: Range = '3M'): PriceBar[] {
  return engine.getHistory(symbol, range);
}

export function getQuote(symbol: string): Quote {
  return engine.getQuote(symbol);
}

export function getAllQuotes(): Quote[] {
  return engine.getAllQuotes();
}

export function subscribeLiveQuote(symbol: string, onQuote: (q: Quote) => void): () => void {
  return engine.subscribeLiveQuote(symbol, onQuote);
}

export function resetMarketCache(): void {
  engine.resetMarketCache();
}
