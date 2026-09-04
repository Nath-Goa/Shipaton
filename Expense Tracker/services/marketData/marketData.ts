import * as live from '@/services/marketData/liveMarketData';
import { isLiveMarketDataConfigured } from '@/services/marketData/liveMarketData';
import type { PriceBar, Quote, Range } from '@/types/stock';

// Public entry point for stock price data — every screen imports from here,
// never from mockMarketData or liveMarketData directly. Always dispatches to
// the live engine now: it prefers Twelve Data when a paid key is configured,
// otherwise Yahoo Finance's free unofficial endpoint (no key needed), and
// falls back to the local mock engine per symbol on any failure — see
// liveMarketData.ts for the full precedence chain.
export { isLiveMarketDataConfigured };

const engine = live;

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
