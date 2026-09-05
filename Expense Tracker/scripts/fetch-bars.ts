/* eslint-disable no-console */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Bar } from '@/services/predictor/features';

// Shared Yahoo fetch + on-disk cache for the offline predictor scripts.
// Same browser User-Agent the app uses (Yahoo 429s anything else) and the
// same polite concurrency, so running these doesn't get the endpoint angry
// at the developer's IP.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// A broad, liquid US large-cap cross-section. The app only trades the 27 in
// constants/tickers.ts, but the shipped model weights are fitted over this
// wider universe: more sectors and more regimes per unit of history make the
// fitted weights generalise instead of memorising a handful of names.
export const TRAINING_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX', 'JPM', 'V',
  'WMT', 'DIS', 'KO', 'PG', 'XOM', 'BA', 'NKE', 'SBUX', 'AMD', 'INTC',
  'PYPL', 'ADBE', 'CRM', 'UBER', 'ORCL', 'JNJ', 'PFE', 'CSCO', 'PEP', 'COST',
  'MRK', 'ABBV', 'TMO', 'ACN', 'MCD', 'ABT', 'DHR', 'LIN', 'TXN', 'NEE',
  'PM', 'UNP', 'LOW', 'HON', 'QCOM', 'IBM', 'GE', 'CAT', 'DE', 'GS',
  'MS', 'BLK', 'AXP', 'SPGI', 'BKNG', 'ISRG', 'AMGN', 'GILD', 'CVS', 'CI',
  'MDT', 'SYK', 'BSX', 'LMT', 'RTX', 'NOC', 'GD', 'MMM', 'EMR', 'ETN',
  'CVX', 'COP', 'SLB', 'EOG', 'PSX', 'VLO', 'T', 'VZ', 'CMCSA', 'TMUS',
  'BAC', 'WFC', 'C', 'SCHW', 'USB', 'PNC', 'TGT', 'HD', 'CL', 'KMB',
];

async function fetchBars(symbol: string, range: string): Promise<Bar[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.warn(`  ${symbol}: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!timestamps || !q) return null;
    const bars: Bar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = q.open?.[i];
      const high = q.high?.[i];
      const low = q.low?.[i];
      const close = q.close?.[i];
      if (![open, high, low, close].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      bars.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), open, high, low, close });
    }
    return bars.length > 300 ? bars : null;
  } catch (e) {
    console.warn(`  ${symbol}: ${e instanceof Error ? e.message : 'failed'}`);
    return null;
  }
}

export async function loadBars(
  symbols: string[],
  cacheName: string,
  range = '10y'
): Promise<Map<string, Bar[]>> {
  const cachePath = join(process.cwd(), '.cache', `${cacheName}.json`);
  if (existsSync(cachePath) && !process.env.REFRESH) {
    const raw = JSON.parse(readFileSync(cachePath, 'utf8')) as Record<string, Bar[]>;
    console.log(`Loaded ${Object.keys(raw).length} symbols from cache (REFRESH=1 to refetch)\n`);
    return new Map(Object.entries(raw));
  }

  console.log(`Fetching ${range} of daily bars for ${symbols.length} symbols from Yahoo...`);
  const out = new Map<string, Bar[]>();
  const queue = [...symbols];
  const workers = Array.from({ length: 3 }, async () => {
    for (;;) {
      const symbol = queue.shift();
      if (!symbol) return;
      const bars = await fetchBars(symbol, range);
      if (bars) out.set(symbol, bars);
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await Promise.all(workers);

  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(Object.fromEntries(out)));
  console.log(`Fetched ${out.size}/${symbols.length} symbols\n`);
  return out;
}
