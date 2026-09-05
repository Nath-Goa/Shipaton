import AsyncStorage from '@react-native-async-storage/async-storage';

import { TICKERS } from '@/constants/tickers';
import * as mock from '@/services/marketData/mockMarketData';
import { fetchDailyBars, fetchQuotesBatch, isLiveMarketDataConfigured as isTwelveDataConfigured } from '@/services/marketData/twelveData';
import { fetchSymbolData, type SymbolData } from '@/services/marketData/yahooFinance';
import type { PriceBar, Quote, Range } from '@/types/stock';

// Live data is always attempted now — Twelve Data when a paid key is
// configured (services/marketData/twelveData.ts: higher-quality, one batched
// call covers every ticker's quote), otherwise Yahoo Finance's free
// unofficial endpoint (services/marketData/yahooFinance.ts: no key, no
// signup, works out of the box). Every export below keeps the exact same
// synchronous signature as mockMarketData.ts regardless of which provider
// (or neither) is actually answering — existing screens don't need to know
// or care. A symbol always renders instantly from whatever's cached — mock
// data on first paint, swapped for real bars/quote once a background fetch
// lands — so the UI never blocks or blanks out on a slow or failed network
// call.
export function isLiveMarketDataConfigured(): boolean {
  return true;
}

// Fetches are TTL-gated per symbol (not per render): daily bars barely move
// intraday so a 6h TTL is plenty. Quotes are trickier — Twelve Data bills 1
// credit PER SYMBOL on its batched /quote call (confirmed in their docs),
// not 1 credit per request, so a single batch across TICKERS' ~26 symbols
// costs ~26 credits regardless of the 8-req/min cap being nowhere near hit.
// At the old 60s TTL that's ~26 credits/minute of active screen time — the
// free tier's 800 credits/day budget was gone after about half an hour of
// use, after which every quote silently fell back to cached/mock for the
// rest of the day. 5 minutes stretches the same budget across ~2.5 hours of
// continuous use, which is a much better match for how this app is actually
// used (opened for a few minutes at a time, not left open all day). Yahoo's
// endpoint has no published limit but shares the same TTL either way.
const BARS_TTL_MS = 6 * 60 * 60 * 1000;
const QUOTE_TTL_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'live-market-data-cache-v1';

const barsCache = new Map<string, PriceBar[]>();
const barsFetchedAt = new Map<string, number>();
const quoteCache = new Map<string, Quote>();
// Per-symbol now (not one shared "last batch" timestamp) — Yahoo has no
// batch-quote endpoint, so each symbol's quote is fetched and gated
// independently when Twelve Data isn't configured.
const quoteFetchedAt = new Map<string, number>();

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

function applyYahooResult(symbol: string, data: SymbolData): void {
  barsCache.set(symbol, data.bars);
  barsFetchedAt.set(symbol, Date.now());
  persistBars();
  if (data.quote) {
    quoteCache.set(symbol, { symbol, ...data.quote });
    quoteFetchedAt.set(symbol, Date.now());
  }
}

let barsFetchInFlight = new Set<string>();

function maybeRefreshBars(symbol: string): void {
  const fetchedAt = barsFetchedAt.get(symbol) ?? 0;
  if (Date.now() - fetchedAt < BARS_TTL_MS) return;
  if (barsFetchInFlight.has(symbol)) return;
  barsFetchInFlight.add(symbol);

  const viaYahoo = () => fetchSymbolData(symbol).then((data) => data && applyYahooResult(symbol, data));

  const attempt = isTwelveDataConfigured()
    ? fetchDailyBars(symbol).then((bars) => {
        if (bars) {
          barsCache.set(symbol, bars);
          barsFetchedAt.set(symbol, Date.now());
          persistBars();
          return;
        }
        // Twelve Data came up empty for this symbol specifically — Yahoo as
        // a free secondary source rather than dropping straight to mock.
        return viaYahoo();
      })
    : viaYahoo();

  attempt.finally(() => barsFetchInFlight.delete(symbol));
}

let quoteFetchInFlight = new Set<string>();

// Yahoo-only path: Twelve Data's quotes are refreshed via the batched
// function below instead, one call for every ticker.
function maybeRefreshQuoteYahoo(symbol: string): void {
  const fetchedAt = quoteFetchedAt.get(symbol) ?? 0;
  if (Date.now() - fetchedAt < QUOTE_TTL_MS) return;
  if (quoteFetchInFlight.has(symbol)) return;
  quoteFetchInFlight.add(symbol);
  fetchSymbolData(symbol)
    .then((data) => data && applyYahooResult(symbol, data))
    .finally(() => quoteFetchInFlight.delete(symbol));
}

let lastBatchQuoteFetch = 0;
let batchQuoteInFlight: Promise<void> | null = null;

function maybeRefreshAllQuotesTwelveData(): void {
  if (Date.now() - lastBatchQuoteFetch < QUOTE_TTL_MS) return;
  if (batchQuoteInFlight) return;
  lastBatchQuoteFetch = Date.now();
  batchQuoteInFlight = fetchQuotesBatch(TICKERS.map((t) => t.symbol))
    .then((live) => {
      for (const [symbol, q] of live.entries()) {
        quoteCache.set(symbol, { symbol, ...q });
        quoteFetchedAt.set(symbol, Date.now());
      }
      // Twelve Data's batch can silently come back empty for every symbol —
      // an invalid/revoked/quota-exhausted key isn't a thrown error, just a
      // response with nothing usable in it — and unlike fetchDailyBars this
      // has no per-symbol null to react to individually. Route whatever
      // Twelve Data didn't return through Yahoo per symbol, the same way
      // maybeRefreshBars already does for bars, so a bad key degrades to
      // Yahoo's real quotes instead of sitting on stale/mock ones all day.
      for (const t of TICKERS) {
        if (!live.has(t.symbol)) maybeRefreshQuoteYahoo(t.symbol);
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
  if (isTwelveDataConfigured()) maybeRefreshAllQuotesTwelveData();
  else maybeRefreshQuoteYahoo(symbol);
  return quoteCache.get(symbol) ?? quoteFromBars(symbol) ?? mock.getQuote(symbol);
}

export function getAllQuotes(): Quote[] {
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
  quoteFetchedAt.clear();
  lastBatchQuoteFetch = 0;
  quoteCache.clear();
}
