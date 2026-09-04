import type { PriceBar } from '@/types/stock';

// Thin client for Yahoo Finance's unofficial "chart" endpoint — no API key,
// no signup, works for any real ticker. It's the one endpoint that's stayed
// reliably reachable without auth/cookies (the older v7 "quote" endpoint has
// increasingly needed a session crumb Yahoo doesn't grant to plain fetches),
// and conveniently returns both daily OHLC bars AND a live-ish quote (via
// `meta`) in a single request, so one fetch per symbol covers both needs.
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

async function fetchChart(symbol: string, range: string): Promise<ChartResult | null> {
  try {
    const url = `${API_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0] as ChartResult | undefined;
    if (!result || json?.chart?.error) return null;
    return result;
  } catch {
    return null;
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

function quoteFromChart(result: ChartResult): LiveQuote | null {
  const meta = result.meta;
  const price = meta?.regularMarketPrice;
  if (!Number.isFinite(price)) return null;
  const prevClose = meta?.previousClose ?? meta?.chartPreviousClose;
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

// One request covers both needs (bars + quote, via meta) — a 2-year range
// comfortably covers the ~400 trading days the rest of the app expects
// (mock engine included) while still giving a fresh meta.regularMarketPrice.
export async function fetchSymbolData(symbol: string): Promise<SymbolData | null> {
  const result = await fetchChart(symbol, '2y');
  if (!result) return null;
  const bars = barsFromChart(result);
  if (!bars) return null;
  return { bars, quote: quoteFromChart(result) };
}
