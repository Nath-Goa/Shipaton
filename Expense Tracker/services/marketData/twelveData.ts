import type { PriceBar } from '@/types/stock';

// Thin client for the Twelve Data REST API (twelvedata.com) — free tier is
// 8 requests/minute and 800 credits/day, which is why every caller in
// liveMarketData.ts gates these behind a TTL rather than calling on every
// render. Every function here returns null on any failure (bad key, rate
// limit, network error, unexpected shape) instead of throwing, so the live
// layer can fall back to cached or mock data without a try/catch at every
// call site.

const API_BASE = 'https://api.twelvedata.com';
const API_KEY = process.env.EXPO_PUBLIC_TWELVEDATA_API_KEY?.trim() || undefined;

export function isLiveMarketDataConfigured(): boolean {
  return !!API_KEY;
}

type RawQuote = {
  symbol?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  high?: string;
  low?: string;
  status?: string;
};

export type LiveQuote = {
  price: number;
  changeAbs: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
};

function parseQuote(raw: RawQuote): LiveQuote | null {
  // Guard on `raw` before touching any of its fields — a batch response can
  // legitimately omit a key entirely (unsupported symbol, or the whole
  // response degrading to a single flat error object once a quota is hit,
  // which makes every symbol's lookup undefined). Reading raw.close first
  // threw here and got swallowed by fetchQuotesBatch's catch, silently
  // dropping every symbol from that point onward in the loop, every cycle.
  if (!raw || raw.status === 'error') return null;
  const price = Number(raw.close);
  if (!Number.isFinite(price)) return null;
  const prevClose = Number(raw.previous_close);
  const changeAbs = Number(raw.change);
  const changePct = Number(raw.percent_change);
  return {
    price,
    changeAbs: Number.isFinite(changeAbs) ? changeAbs : Number.isFinite(prevClose) ? price - prevClose : 0,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    dayHigh: Number.isFinite(Number(raw.high)) ? Number(raw.high) : price,
    dayLow: Number.isFinite(Number(raw.low)) ? Number(raw.low) : price,
  };
}

// One HTTP call for the whole symbol list (comma-joined) — Twelve Data
// still bills one credit per symbol, but batching into a single request
// keeps this well under the free tier's 8-requests/minute cap regardless
// of how many symbols the app tracks.
export async function fetchQuotesBatch(symbols: string[]): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>();
  if (!API_KEY || symbols.length === 0) return result;
  try {
    const url = `${API_BASE}/quote?symbol=${encodeURIComponent(symbols.join(','))}&apikey=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return result;
    const json = await res.json();
    if (symbols.length === 1) {
      const quote = parseQuote(json);
      if (quote) result.set(symbols[0], quote);
      return result;
    }
    for (const symbol of symbols) {
      const quote = parseQuote(json[symbol]);
      if (quote) result.set(symbol, quote);
    }
    return result;
  } catch {
    return result;
  }
}

type RawBar = { datetime?: string; open?: string; high?: string; low?: string; close?: string };

// order=ASC gives oldest-first, matching PriceBar[] ordering used everywhere
// else in the app (mock engine included) — no client-side reversal needed.
export async function fetchDailyBars(symbol: string, outputSize = 400): Promise<PriceBar[] | null> {
  if (!API_KEY) return null;
  try {
    const url = `${API_BASE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputSize}&order=ASC&apikey=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status === 'error' || !Array.isArray(json.values)) return null;
    const bars: PriceBar[] = (json.values as RawBar[])
      .map((v) => ({
        date: (v.datetime ?? '').slice(0, 10),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
      }))
      .filter((b) => b.date && [b.open, b.high, b.low, b.close].every(Number.isFinite));
    return bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}
