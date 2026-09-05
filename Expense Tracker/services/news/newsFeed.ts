import type { NewsItem } from '@/types/prediction';

// Real headlines from Yahoo Finance's search endpoint — the same unofficial,
// key-free surface the price data already comes from, and subject to the
// same rules: a browser User-Agent (it 429s anything else) and a hard
// requirement never to throw. News is a nice-to-have on top of a price
// model; a failed fetch must degrade to "no headlines", never to a broken
// screen.

const SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 10_000;

let lastError: string | null = null;
let lastFetchedAt = 0;

export function getNewsStatus(): { lastError: string | null; lastFetchedAt: number } {
  return { lastError, lastFetchedAt };
}

type RawNews = {
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  uuid?: string;
};

export async function fetchHeadlines(symbol: string, limit = 8): Promise<NewsItem[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(symbol)}&newsCount=${limit}&quotesCount=0`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      lastError = `${symbol}: HTTP ${res.status}`;
      return [];
    }
    const json = (await res.json()) as { news?: RawNews[] };
    const items: NewsItem[] = [];
    for (const raw of json.news ?? []) {
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      if (!title) continue;
      items.push({
        id: raw.uuid ?? `${symbol}-${title.slice(0, 40)}`,
        title,
        publisher: typeof raw.publisher === 'string' ? raw.publisher : 'Unknown',
        url: typeof raw.link === 'string' ? raw.link : undefined,
        publishedAt: typeof raw.providerPublishTime === 'number' ? raw.providerPublishTime * 1000 : Date.now(),
        symbol,
      });
    }
    lastError = null;
    lastFetchedAt = Date.now();
    return items;
  } catch (e) {
    lastError = `${symbol}: ${e instanceof Error ? e.message : 'network error'}`;
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
