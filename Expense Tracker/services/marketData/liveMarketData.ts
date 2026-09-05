import AsyncStorage from '@react-native-async-storage/async-storage';

import { TICKERS } from '@/constants/tickers';
import * as mock from '@/services/marketData/mockMarketData';
import { fetchDailyBars, fetchQuotesBatch, isLiveMarketDataConfigured as isTwelveDataConfigured } from '@/services/marketData/twelveData';
import { fetchQuote, fetchSymbolData, getYahooStatus, type LiveQuote } from '@/services/marketData/yahooFinance';
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
// At a 60s TTL that's ~26 credits/minute of active screen time — the free
// tier's 800 credits/day budget was gone after about half an hour of use,
// after which every quote silently fell back to cached/mock for the rest of
// the day. 5 minutes stretches the same budget across ~2.5 hours of
// continuous use, which is a much better match for how this app is actually
// used (opened for a few minutes at a time, not left open all day).
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
AsyncStorage.getItem(STORAGE_KEY)
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

// The whole cache is re-serialized on every write, so a refresh sweep that
// lands 27 symbols in a few seconds would otherwise do 27 full ~1MB writes
// back to back. Coalesce them into one trailing write instead. Bars are
// also trimmed to the ~400 sessions the rest of the app actually reads
// (mock engine included) rather than the full two years the fetch returns,
// which keeps the stored blob well clear of Android's row-size ceiling.
const PERSIST_DEBOUNCE_MS = 2000;
const PERSISTED_BARS_PER_SYMBOL = 400;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistBars(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const bars: Record<string, { bars: PriceBar[]; at: number }> = {};
    for (const [symbol, value] of barsCache.entries()) {
      bars[symbol] = {
        bars: value.slice(Math.max(0, value.length - PERSISTED_BARS_PER_SYMBOL)),
        at: barsFetchedAt.get(symbol) ?? 0,
      };
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ bars })).catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

// --- request throttle -------------------------------------------------
// Screens poll getQuote on a 3s timer across every tracked symbol, so an
// ungoverned refresh fired ~27 simultaneous requests every 3 seconds —
// hundreds per minute at a burst width no free endpoint tolerates. Yahoo
// answers that with rate limiting, which made every symbol fail, which
// (with no backoff, see below) immediately retried the same burst: the app
// could never climb out of it and every price stayed on the mock engine
// indefinitely. Everything network-bound now goes through this queue.
const MAX_CONCURRENT_REQUESTS = 3;
const MIN_REQUEST_SPACING_MS = 150;

const requestQueue: Array<() => void> = [];
let activeRequests = 0;
let lastRequestStartedAt = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function pumpQueue(): void {
  if (pumpTimer) return;
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) return;
  const wait = Math.max(0, MIN_REQUEST_SPACING_MS - (Date.now() - lastRequestStartedAt));
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    const job = requestQueue.shift();
    if (job) {
      activeRequests += 1;
      lastRequestStartedAt = Date.now();
      job();
    }
    pumpQueue();
  }, wait);
}

function schedule<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    requestQueue.push(() => {
      work()
        .then(resolve, () => resolve(undefined as T))
        .finally(() => {
          activeRequests -= 1;
          pumpQueue();
        });
    });
    pumpQueue();
  });
}

// --- failure backoff --------------------------------------------------
// A symbol's "fetched at" timestamp is only stamped on success, so without
// this a failing symbol was permanently past its TTL and retried on every
// single poll. Backoff makes a failing provider quiet down instead of
// spiralling, and gives a rate-limited endpoint room to let us back in.
const FAILURE_BACKOFF_MS = [20_000, 60_000, 180_000, 300_000];
const failureStreak = new Map<string, number>();
const retryAfter = new Map<string, number>();

function noteFetchFailure(symbol: string): void {
  const streak = (failureStreak.get(symbol) ?? 0) + 1;
  failureStreak.set(symbol, streak);
  retryAfter.set(symbol, Date.now() + FAILURE_BACKOFF_MS[Math.min(streak - 1, FAILURE_BACKOFF_MS.length - 1)]);
}

function noteFetchSuccess(symbol: string): void {
  failureStreak.delete(symbol);
  retryAfter.delete(symbol);
}

function isBackingOff(symbol: string): boolean {
  return Date.now() < (retryAfter.get(symbol) ?? 0);
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

function applyBars(symbol: string, bars: PriceBar[]): void {
  barsCache.set(symbol, bars);
  barsFetchedAt.set(symbol, Date.now());
  persistBars();
}

function applyQuote(symbol: string, quote: LiveQuote): void {
  quoteCache.set(symbol, { symbol, ...quote });
  quoteFetchedAt.set(symbol, Date.now());
}

const barsFetchInFlight = new Set<string>();

function maybeRefreshBars(symbol: string): void {
  if (Date.now() - (barsFetchedAt.get(symbol) ?? 0) < BARS_TTL_MS) return;
  if (barsFetchInFlight.has(symbol) || isBackingOff(symbol)) return;
  barsFetchInFlight.add(symbol);

  schedule(async () => {
    // Twelve Data first when its key is configured, Yahoo as the free
    // secondary for anything it can't answer (unsupported symbol, spent
    // quota, bad key) rather than dropping straight to mock.
    const viaTwelveData = isTwelveDataConfigured() ? await fetchDailyBars(symbol) : null;
    if (viaTwelveData) {
      applyBars(symbol, viaTwelveData);
      noteFetchSuccess(symbol);
      return;
    }
    const viaYahoo = await fetchSymbolData(symbol);
    if (viaYahoo) {
      applyBars(symbol, viaYahoo.bars);
      // The 2y request carries a fresh quote for free — take it rather
      // than spending a separate request on the same symbol.
      if (viaYahoo.quote) applyQuote(symbol, viaYahoo.quote);
      noteFetchSuccess(symbol);
      return;
    }
    noteFetchFailure(symbol);
  }).finally(() => barsFetchInFlight.delete(symbol));
}

const quoteFetchInFlight = new Set<string>();

// Yahoo path: one cheap 5-day request per symbol. Deliberately does NOT
// touch barsCache — a 5-day series would overwrite the 2-year history the
// charts and net-worth reconstruction depend on, and would satisfy the 6h
// bars TTL while doing it.
function maybeRefreshQuoteYahoo(symbol: string): void {
  if (Date.now() - (quoteFetchedAt.get(symbol) ?? 0) < QUOTE_TTL_MS) return;
  if (quoteFetchInFlight.has(symbol) || isBackingOff(symbol)) return;
  quoteFetchInFlight.add(symbol);

  schedule(async () => {
    const quote = await fetchQuote(symbol);
    if (quote) {
      applyQuote(symbol, quote);
      noteFetchSuccess(symbol);
      return;
    }
    noteFetchFailure(symbol);
  }).finally(() => quoteFetchInFlight.delete(symbol));
}

let lastBatchQuoteFetch = 0;
let batchQuoteInFlight: Promise<void> | null = null;

function maybeRefreshAllQuotesTwelveData(): void {
  if (Date.now() - lastBatchQuoteFetch < QUOTE_TTL_MS) return;
  if (batchQuoteInFlight) return;
  lastBatchQuoteFetch = Date.now();
  batchQuoteInFlight = fetchQuotesBatch(TICKERS.map((t) => t.symbol))
    .then((live) => {
      for (const [symbol, q] of live.entries()) applyQuote(symbol, q);
      // Twelve Data's batch can silently come back empty for every symbol —
      // an invalid/revoked/quota-exhausted key isn't a thrown error, just a
      // response with nothing usable in it. Route whatever it didn't return
      // through Yahoo per symbol so a bad key degrades to real Yahoo quotes
      // instead of sitting on stale/mock ones all day.
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
  // Bars are the durable copy of real data (they persist across restarts),
  // so a symbol whose live quote hasn't landed yet still reads a real price
  // off its cached history rather than the mock engine.
  return quoteCache.get(symbol) ?? quoteFromBars(symbol) ?? mock.getQuote(symbol);
}

export function getAllQuotes(): Quote[] {
  return TICKERS.map((t) => getQuote(t.symbol));
}

const liveListeners = new Map<string, Set<(q: Quote) => void>>();
const liveTimers = new Map<string, ReturnType<typeof setInterval>>();
// Markets' own symbol detail screen no longer uses this (it fetches once
// per visit plus a manual refresh button instead — see markets/[symbol].tsx)
// — the remaining caller is Portfolio's trade screen, which should still
// stay live but only needs a once-a-minute cadence, not every 15s.
const LIVE_POLL_MS = 60_000;

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
// Backoff is cleared too: an explicit pull-to-refresh is the user asking us
// to try again now, not in five minutes.
export function resetMarketCache(): void {
  barsFetchedAt.clear();
  quoteFetchedAt.clear();
  lastBatchQuoteFetch = 0;
  quoteCache.clear();
  failureStreak.clear();
  retryAfter.clear();
}

export type MarketDataStatus = {
  provider: string;
  hasTwelveDataKey: boolean;
  totalSymbols: number;
  symbolsWithLiveQuote: number;
  symbolsWithLiveBars: number;
  pendingRequests: number;
  backingOff: number;
} & ReturnType<typeof getYahooStatus>;

// Read-only snapshot for Settings › Market data. Live prices failing on a
// real device used to be completely opaque — this makes the actual reason
// (HTTP status, network error, how many symbols have real data) visible
// instead of guessable.
export function getMarketDataStatus(): MarketDataStatus {
  const symbols = TICKERS.map((t) => t.symbol);
  return {
    provider: isTwelveDataConfigured() ? 'Twelve Data, Yahoo Finance fallback' : 'Yahoo Finance',
    hasTwelveDataKey: isTwelveDataConfigured(),
    totalSymbols: symbols.length,
    symbolsWithLiveQuote: symbols.filter((s) => quoteCache.has(s)).length,
    symbolsWithLiveBars: symbols.filter((s) => (barsCache.get(s)?.length ?? 0) > 0).length,
    pendingRequests: requestQueue.length + activeRequests,
    backingOff: symbols.filter((s) => isBackingOff(s)).length,
    ...getYahooStatus(),
  };
}
