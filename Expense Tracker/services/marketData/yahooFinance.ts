import type { PriceBar } from '@/types/stock';

// Thin client for Yahoo Finance's unofficial "chart" endpoint — no API key,
// no signup, works for any real ticker. It's the one endpoint that's stayed
// reliably reachable without auth/cookies (the older v7 "quote" endpoint has
// increasingly needed a session crumb Yahoo doesn't grant to plain fetches),
// and conveniently returns both daily OHLC bars AND a live-ish quote (via
// `meta`) in a single request.
//
// Unofficial and undocumented by Yahoo — like any scraped endpoint it can
// change or rate-limit without notice, which is exactly why every function
// here returns null on any failure instead of throwing: the caller
// (liveMarketData.ts) already falls back to cached-then-mock data per
// symbol, so a bad response here just means slightly staler data, never a
// broken screen. On the web preview target specifically, Yahoo's CORS
// headers can block this fetch entirely from a browser context — native
// iOS/Android fetch isn't subject to CORS at all, so this is expected to
// work there even when it silently no-ops on web.
const API_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Every failure used to vanish into a bare `catch {}`, which made "why is it
// still showing mock prices?" impossible to answer from the device. These
// counters are surfaced read-only in Settings › Market data so a failing
// install can actually be diagnosed instead of guessed at.
let lastError: string | null = null;
let lastErrorAt: number | null = null;
let lastSuccessAt: number | null = null;
let requestCount = 0;
let failureCount = 0;

export type YahooStatus = {
  lastError: string | null;
  lastErrorAt: number | null;
  lastSuccessAt: number | null;
  requestCount: number;
  failureCount: number;
};

export function getYahooStatus(): YahooStatus {
  return { lastError, lastErrorAt, lastSuccessAt, requestCount, failureCount };
}

function noteFailure(detail: string): null {
  failureCount += 1;
  lastError = detail;
  lastErrorAt = Date.now();
  return null;
}

export type LiveQuote = {
  price: number;
  changeAbs: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
};

type ChartResult = {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    regularMarketDayHigh?: number;
    regularMarketDayLow?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[] }[];
  };
};

// Market dates belong to the exchange's calendar, not the viewer's local
// timezone — UTC slicing keeps a given bar's date stable regardless of
// which timezone the device is in (unlike utils/date.ts's toDateStr, which
// is deliberately local-time for on-device data like expenses).
function utcDateStr(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// Yahoo's unofficial endpoint 429s any request that doesn't look like a
// real browser — confirmed directly (curl with no UA: 429; with this UA:
// 200). Native fetch lets us set this freely (unlike a real browser, which
// silently ignores a script-set User-Agent), so this is what actually makes
// live data work on-device — without it every request fails and every
// symbol silently renders from the mock engine instead, indefinitely.
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// A hung request holds a slot in the throttle queue, which stalls every
// other symbol behind it — cap it rather than waiting on the OS default.
const REQUEST_TIMEOUT_MS = 12_000;

async function fetchChart(symbol: string, range: string): Promise<ChartResult | null> {
  requestCount += 1;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${API_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return noteFailure(`${symbol}: HTTP ${res.status}`);
    const json = await res.json();
    const result = json?.chart?.result?.[0] as ChartResult | undefined;
    if (json?.chart?.error) {
      return noteFailure(`${symbol}: ${json.chart.error?.description ?? 'Yahoo returned an error'}`);
    }
    if (!result) return noteFailure(`${symbol}: empty response`);
    lastSuccessAt = Date.now();
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'network error';
    return noteFailure(`${symbol}: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function barsFromChart(result: ChartResult): PriceBar[] | null {
  const timestamps = result.timestamp;
  const q = result.indicators?.quote?.[0];
  if (!timestamps || !q) return null;
  const bars: PriceBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = q.open?.[i];
    const high = q.high?.[i];
    const low = q.low?.[i];
    const close = q.close?.[i];
    // Yahoo pads non-trading days (holidays, or "today" before the close)
    // with nulls in every field — skip rather than push a broken bar.
    const isFiniteNumber = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
    if (!isFiniteNumber(open) || !isFiniteNumber(high) || !isFiniteNumber(low) || !isFiniteNumber(close)) continue;
    bars.push({ date: utcDateStr(timestamps[i]), open, high, low, close });
  }
  return bars.length > 0 ? bars : null;
}

// Never meta.chartPreviousClose: that's the close before the *requested
// range* starts, not the previous session. On the 2y history fetch it made
// AAPL's "today" +48.8% (its price two years ago as the baseline), and on
// the 5d quote fetch every change was a 5-day change. Yahoo no longer sends
// meta.previousClose for these requests, so yesterday's close comes from
// the series itself: the session before the latest one (barsFromChart has
// already dropped today's all-null placeholder bar before the open).
function previousSessionClose(result: ChartResult): number | undefined {
  if (Number.isFinite(result.meta?.previousClose)) return result.meta!.previousClose;
  const bars = barsFromChart(result);
  return bars && bars.length >= 2 ? bars[bars.length - 2].close : undefined;
}

function quoteFromChart(result: ChartResult): LiveQuote | null {
  const meta = result.meta;
  const price = meta?.regularMarketPrice;
  if (!Number.isFinite(price)) return null;
  const prevClose = previousSessionClose(result);
  const changeAbs = Number.isFinite(prevClose) ? price! - prevClose! : 0;
  return {
    price: price!,
    changeAbs,
    changePct: Number.isFinite(prevClose) && prevClose ? (changeAbs / prevClose!) * 100 : 0,
    dayHigh: meta?.regularMarketDayHigh ?? price!,
    dayLow: meta?.regularMarketDayLow ?? price!,
  };
}

export type SymbolData = { bars: PriceBar[]; quote: LiveQuote | null };

// The full history fetch: one 2-year request covers the ~400 trading days
// the rest of the app expects (mock engine included) and carries a fresh
// meta.regularMarketPrice for free. Only worth paying for on the 6h bars
// TTL — quote refreshes use fetchQuote below instead.
export async function fetchSymbolData(symbol: string): Promise<SymbolData | null> {
  const result = await fetchChart(symbol, '2y');
  if (!result) return null;
  const bars = barsFromChart(result);
  if (!bars) return null;
  return { bars, quote: quoteFromChart(result) };
}

// Quote-only refresh. A 5-day range is a tiny fraction of the 2-year
// payload and carries the same meta.regularMarketPrice, which matters a
// lot here: quotes refresh many times more often than bars, across every
// tracked symbol.
export async function fetchQuote(symbol: string): Promise<LiveQuote | null> {
  const result = await fetchChart(symbol, '5d');
  if (!result) return null;
  return quoteFromChart(result);
}

const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';

export type SymbolSearchResult = { symbol: string; name: string; exchange: string };

type SearchQuote = { symbol?: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string };

// Resolves a company name or a symbol nobody's heard of to real tickers —
// the same unofficial search endpoint services/news/newsFeed.ts uses for
// headlines, just reading its `quotes` array instead of `news`. Deliberately
// doesn't share this module's request-count/error tracking (that's about
// price-fetch health for Settings › Market data; a search miss isn't a
// data-quality problem worth conflating with it) — failure here just means
// an empty result list, same "degrade, never throw" rule as everything else
// in this file.
export async function searchSymbols(query: string, limit = 5): Promise<SymbolSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(trimmed)}&quotesCount=${limit * 3}&newsCount=0`;
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT }, signal: controller.signal });
    if (!res.ok) return [];
    const json = (await res.json()) as { quotes?: SearchQuote[] };
    const quotes = json.quotes ?? [];
    // EQUITY only (skip ETFs/indices/crypto) and no "." suffix (skip
    // non-US listings of the same company, e.g. PLTR.TO/PLTR.SW) — the
    // mock/live engine and the rest of this app assume plain US symbols.
    return quotes
      .filter((q): q is Required<Pick<SearchQuote, 'symbol'>> & SearchQuote => q.quoteType === 'EQUITY' && !!q.symbol && !q.symbol.includes('.'))
      .slice(0, limit)
      .map((q) => ({ symbol: q.symbol, name: q.shortname ?? q.longname ?? q.symbol, exchange: q.exchDisp ?? '' }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
