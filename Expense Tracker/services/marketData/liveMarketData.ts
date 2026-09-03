import AsyncStorage from '@react-native-async-storage/async-storage';

import { TICKERS } from '@/constants/tickers';
import * as mock from '@/services/marketData/mockMarketData';
import { fetchDailyBars, fetchQuotesBatch, isLiveMarketDataConfigured } from '@/services/marketData/twelveData';
import type { PriceBar, Quote, Range } from '@/types/stock';

export { isLiveMarketDataConfigured };

// Real prices layered on top of the mock engine: every export below has the
// exact same synchronous signature as mockMarketData.ts (existing screens
// don't need to know or care which one they're calling). A symbol always
// renders instantly from whatever's cached — mock data on first paint,
// swapped for a real quote/bars once a background fetch lands — so the UI
// never blocks or blanks out on a slow or failed network call.
//
// Fetches are TTL-gated per symbol (not per render) to stay well inside
// Twelve Data's free tier (8 req/min, 800 credits/day): daily bars barely
// move intraday so a 6h TTL is plenty, and quotes refresh at most once a
// minute even if a screen polls this every few seconds.
const BARS_TTL_MS = 6 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 60 * 1000;
const STORAGE_KEY = 'live-market-data-cache-v1';

const barsCache = new Map<string, PriceBar[]>();
const barsFetchedAt = new Map<string, number>();
const quoteCache = new Map<string, Quote>();
let lastBatchQuoteFetch = 0;
let batchQuoteInFlight: Promise<void> | null = null;

let hydrated = false;
const hydration = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (!raw) return;
    const parsed = JSON.parse(raw) as { bars?: Record<string, { bars: PriceBar[]; at: number }> };
    for (const [symbol, entry] of Object.entries(parsed.bars ?? {})) {
      barsCache.set(symbol, entry.bars);
      barsFetchedAt.set(symbol, entry.at);
    }
  })
  .catch(() => undefined)
  .finally(() => {
    hydrated = true;
  });

function persistBars(): void {
  const bars: Record<string, { bars: PriceBar[]; at: number }> = {};
  for (const [symbol, value] of barsCache.entries()) {
    bars[symbol] = { bars: value, at: barsFetchedAt.get(symbol) ?? 0 };
  }
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ bars })).catch(() => undefined);
}

function quoteFromBars(symbol: string): Quote | null {
  const bars = barsCache.get(symbol);
  if (!bars || bars.length === 0) return null;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] ?? last;
  const changeAbs = last.close - prev.close;
  return {
    symbol,
    price: last.close,
    changeAbs,
    changePct: prev.close ? (changeAbs / prev.close) * 100 : 0,
    dayHigh: last.high,
    dayLow: last.low,
  };
}

let barsFetchInFlight = new Set<string>();

function maybeRefreshBars(symbol: string): void {
  const fetchedAt = barsFetchedAt.get(symbol) ?? 0;
  if (Date.now() - fetchedAt < BARS_TTL_MS) return;
  if (barsFetchInFlight.has(symbol)) return;
  barsFetchInFlight.add(symbol);
  fetchDailyBars(symbol)
    .then((bars) => {
      if (bars) {
        barsCache.set(symbol, bars);
        barsFetchedAt.set(symbol, Date.now());
        persistBars();
      }
    })
    .finally(() => barsFetchInFlight.delete(symbol));
}

function maybeRefreshAllQuotes(): void {
  if (Date.now() - lastBatchQuoteFetch < QUOTE_TTL_MS) return;
  if (batchQuoteInFlight) return;
  lastBatchQuoteFetch = Date.now();
  batchQuoteInFlight = fetchQuotesBatch(TICKERS.map((t) => t.symbol))
    .then((live) => {
      for (const [symbol, q] of live.entries()) {
        quoteCache.set(symbol, {
          symbol,
          price: q.price,
          changeAbs: q.changeAbs,
          changePct: q.changePct,
          dayHigh: q.dayHigh,
          dayLow: q.dayLow,
        });
      }
    })
    .finally(() => {
      batchQuoteInFlight = null;
    });
}

export function getFullHistory(symbol: string): PriceBar[] {
  if (hydrated) maybeRefreshBars(symbol);
  return barsCache.get(symbol) ?? mock.getFullHistory(symbol);
}

const RANGE_DAYS: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };

export function getHistory(symbol: string, range: Range = '3M'): PriceBar[] {
  const full = getFullHistory(symbol);
  const n = RANGE_DAYS[range];
  return full.slice(Math.max(0, full.length - n));
}

export function getQuote(symbol: string): Quote {
  maybeRefreshAllQuotes();
  return quoteCache.get(symbol) ?? quoteFromBars(symbol) ?? mock.getQuote(symbol);
}

export function getAllQuotes(): Quote[] {
  maybeRefreshAllQuotes();
  return TICKERS.map((t) => getQuote(t.symbol));
}

const liveListeners = new Map<string, Set<(q: Quote) => void>>();
const liveTimers = new Map<string, ReturnType<typeof setInterval>>();
const LIVE_POLL_MS = 15_000;

export function subscribeLiveQuote(symbol: string, onQuote: (q: Quote) => void): () => void {
  if (!liveListeners.has(symbol)) liveListeners.set(symbol, new Set());
  liveListeners.get(symbol)!.add(onQuote);

  if (!liveTimers.has(symbol)) {
    const timer = setInterval(() => {
      liveListeners.get(symbol)?.forEach((cb) => cb(getQuote(symbol)));
    }, LIVE_POLL_MS);
    liveTimers.set(symbol, timer);
  }

  onQuote(getQuote(symbol));

  return () => {
    const set = liveListeners.get(symbol);
    set?.delete(onQuote);
    if (set && set.size === 0) {
      const timer = liveTimers.get(symbol);
      if (timer) clearInterval(timer);
      liveTimers.delete(symbol);
      liveListeners.delete(symbol);
    }
  };
}

// "Regenerating" doesn't make sense for real prices — this instead forces
// every symbol to bypass its TTL and refetch fresh live data on next read.
export function resetMarketCache(): void {
  barsFetchedAt.clear();
  lastBatchQuoteFetch = 0;
  quoteCache.clear();
}
