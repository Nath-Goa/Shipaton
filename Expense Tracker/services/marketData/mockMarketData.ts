import { TICKERS, tickerOf } from '@/constants/tickers';
import { useMarketStore } from '@/store/useMarketStore';
import type { PriceBar, Quote, Range } from '@/types/stock';
import { toDateStr } from '@/utils/date';
import { gaussian, hashString, mulberry32 } from '@/utils/prng';

// ---------------------------------------------------------------------------
// The "mock stocks" engine: a fully local, seeded random-walk price
// simulator over a fixed universe of real ticker symbols. No market-data
// API key required — this is the explicitly-requested paper-trading feature,
// not a fallback for a missing real feed.
// ---------------------------------------------------------------------------

const HISTORY_DAYS = 400;

function dateNDaysAgo(n: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  return dt;
}

const historyCache = new Map<string, PriceBar[]>();

function buildHistory(symbol: string): PriceBar[] {
  const ticker = tickerOf(symbol);
  const base = ticker?.basePrice ?? 100;
  const vol = ticker?.volatility ?? 0.02;
  const epoch = useMarketStore.getState().epoch;
  const rand = mulberry32(hashString(`${symbol}:${epoch}`));

  const closes: number[] = [];
  let price = base;
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const dailyReturn = gaussian(rand) * vol;
    price = Math.max(price * (1 + dailyReturn), 0.5);
    closes.push(price);
  }
  // Rescale the whole walk so the final (most recent) close lands exactly on
  // the ticker's base price — keeps quote lists looking plausible while
  // preserving the shape/volatility of the random walk.
  const scale = base / closes[closes.length - 1];

  const bars: PriceBar[] = [];
  let prevClose = closes[0] * scale;
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const close = closes[i] * scale;
    const open = i === 0 ? prevClose : bars[i - 1].close;
    const wick = Math.abs(close - open) + close * vol * 0.3;
    const high = Math.max(open, close) + wick * rand() * 0.6;
    const low = Math.max(Math.min(open, close) - wick * rand() * 0.6, 0.1);
    const date = toDateStr(dateNDaysAgo(HISTORY_DAYS - 1 - i));
    bars.push({ date, open, high, low, close });
    prevClose = close;
  }
  return bars;
}

export function getFullHistory(symbol: string): PriceBar[] {
  const epoch = useMarketStore.getState().epoch;
  const key = `${symbol}:${epoch}`;
  let cached = historyCache.get(key);
  if (!cached) {
    cached = buildHistory(symbol);
    historyCache.set(key, cached);
  }
  return cached;
}

// Clears cached history and live-price state so the next read re-seeds from
// the (already-bumped) market epoch. Called by services/marketData/regenerateMarket.ts.
export function resetMarketCache(): void {
  historyCache.clear();
  liveState.clear();
  for (const timer of liveTimers.values()) clearInterval(timer);
  liveTimers.clear();
}

const RANGE_DAYS: Record<Range, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };

export function getHistory(symbol: string, range: Range = '3M'): PriceBar[] {
  const full = getFullHistory(symbol);
  const n = RANGE_DAYS[range];
  return full.slice(Math.max(0, full.length - n));
}

// ---------------------------------------------------------------------------
// Live quotes: a small in-memory drift layered on top of the last close
// while at least one screen is actively subscribed (e.g. a stock detail
// screen in focus). Ticks stop the moment nobody is listening.
// ---------------------------------------------------------------------------

const liveState = new Map<string, number>();
const liveListeners = new Map<string, Set<(q: Quote) => void>>();
const liveTimers = new Map<string, ReturnType<typeof setInterval>>();

export function getQuote(symbol: string): Quote {
  const bars = getFullHistory(symbol);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2] ?? last;
  const price = liveState.get(symbol) ?? last.close;
  const changeAbs = price - prev.close;
  const changePct = prev.close ? (changeAbs / prev.close) * 100 : 0;
  return {
    symbol,
    price,
    changeAbs,
    changePct,
    dayHigh: Math.max(last.high, price),
    dayLow: Math.min(last.low, price),
  };
}

export function subscribeLiveQuote(symbol: string, onQuote: (q: Quote) => void): () => void {
  if (!liveListeners.has(symbol)) liveListeners.set(symbol, new Set());
  liveListeners.get(symbol)!.add(onQuote);

  if (!liveTimers.has(symbol)) {
    const ticker = tickerOf(symbol);
    const vol = ticker?.volatility ?? 0.02;
    const rand = mulberry32((hashString(symbol) ^ Date.now()) >>> 0);
    const timer = setInterval(() => {
      const bars = getFullHistory(symbol);
      const anchor = liveState.get(symbol) ?? bars[bars.length - 1].close;
      const nextPrice = Math.max(anchor * (1 + gaussian(rand) * vol * 0.06), 0.1);
      liveState.set(symbol, nextPrice);
      const q = getQuote(symbol);
      liveListeners.get(symbol)?.forEach((cb) => cb(q));
    }, 2500);
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
      liveState.delete(symbol);
    }
  };
}

export function getAllQuotes(): Quote[] {
  return TICKERS.map((t) => getQuote(t.symbol));
}
