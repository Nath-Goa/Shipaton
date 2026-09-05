import { tickerOf } from '@/constants/tickers';
import { getAllQuotes } from '@/services/marketData/marketData';
import { fetchHeadlines } from '@/services/news/newsFeed';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import type { NewsItem } from '@/types/prediction';

// Sectioned market news for the News tab: one general section, one
// "trending" section (today's biggest movers), and one section per symbol
// the user actually holds or watches — reusing the exact Yahoo search
// endpoint services/news/newsFeed.ts already uses for the predictor's
// headline scan, rather than standing up a second news source.

export type NewsSection = {
  key: string;
  title: string;
  symbol?: string;
  items: NewsItem[];
};

// "Updates every hour" — each section's own fetch is gated by this TTL, not
// a global timer, so opening the tab after 20 minutes reuses the cache and
// after 90 minutes refetches just the stale sections.
const SECTION_TTL_MS = 60 * 60 * 1000;
// A fetch that came back with nothing must NOT hold the full hour: stamping
// a failure with the success TTL meant one failed section went dark for an
// hour and wouldn't even retry when the tab was reopened, since the cache
// looked fresh. Short enough to recover on the next visit, long enough not
// to retry the same dead endpoint on every focus.
const FAILED_TTL_MS = 5 * 60 * 1000;
// Same spacing services/predictor/startupScan.ts uses between real network
// calls — hammering this endpoint in a burst is exactly what got live
// prices rate-limited into permanent mock data before (see CLAUDE.md §5.4).
const REQUEST_SPACING_MS = 250;
const TRENDING_COUNT = 3;
const MAX_STOCK_SECTIONS = 12;
const HEADLINES_PER_SECTION = 6;

// A real index symbol gets Yahoo's actual per-security news feed — the
// same mechanism every per-stock section below already relies on — rather
// than a loose text match. "stock market news" as a free-text query could
// (and did) pull back general/off-topic Yahoo News results that merely
// mention "stock" or "market" in passing, not real finance coverage. Three
// broad US indices give wide general-market coverage while staying
// strictly finance-tagged.
const GENERAL_INDEX_SYMBOLS = ['^GSPC', '^DJI', '^IXIC'];
const GENERAL_SECTION_LIMIT = 8;

const cache = new Map<string, { items: NewsItem[]; fetchedAt: number; failed: boolean }>();

function ttlFor(entry: { failed: boolean }): number {
  return entry.failed ? FAILED_TTL_MS : SECTION_TTL_MS;
}

function isFresh(key: string, force: boolean): boolean {
  if (force) return false;
  const entry = cache.get(key);
  return !!entry && Date.now() - entry.fetchedAt < ttlFor(entry);
}

async function loadSection(key: string, query: string, symbol: string | undefined, force: boolean): Promise<NewsItem[]> {
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < ttlFor(cached)) return cached.items;
  const items = await fetchHeadlines(symbol ?? query, HEADLINES_PER_SECTION);
  const failed = items.length === 0;
  // A failed fetch degrades to whatever was cached before (still-stale
  // headlines beat none), never to an empty section wiping out old news —
  // but it's stamped as a failure so it retries on the short TTL instead of
  // sitting dark for the full hour.
  const resolved = failed ? (cached?.items ?? []) : items;
  cache.set(key, { items: resolved, fetchedAt: Date.now(), failed });
  return resolved;
}

function followedSymbols(): string[] {
  const state = usePortfolioStore.getState();
  const active = state.portfolios[state.activePortfolioId];
  const held = active ? Object.keys(active.holdings ?? {}) : [];
  return [...new Set([...held, ...(state.watchlist ?? [])])].slice(0, MAX_STOCK_SECTIONS);
}

function trendingSymbols(): string[] {
  const quotes = getAllQuotes();
  return [...quotes]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, TRENDING_COUNT)
    .map((q) => q.symbol);
}

// Sequential, not Promise.all — the spacing between real network calls only
// works if calls actually happen one after another. Cache hits resolve
// immediately, so a warm reload doesn't pay any delay at all.
async function loadWithSpacing(
  jobs: { key: string; query: string; symbol?: string }[],
  force: boolean
): Promise<Map<string, NewsItem[]>> {
  const result = new Map<string, NewsItem[]>();
  for (const job of jobs) {
    const wasFresh = isFresh(job.key, force);
    result.set(job.key, await loadSection(job.key, job.query, job.symbol, force));
    if (!wasFresh) await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS));
  }
  return result;
}

// Pass force:true for an explicit pull-to-refresh — bypasses every
// section's TTL rather than waiting out the hour.
export async function loadMarketNews(force = false): Promise<NewsSection[]> {
  const followed = followedSymbols();
  const followedSet = new Set(followed);
  // A followed symbol that's also today's biggest mover gets its own named
  // section already — showing it again in Trending would just repeat the
  // same headlines twice on screen.
  const trending = trendingSymbols().filter((symbol) => !followedSet.has(symbol));

  const jobs = [
    ...GENERAL_INDEX_SYMBOLS.map((symbol) => ({ key: `general:${symbol}`, query: symbol, symbol })),
    ...trending.map((symbol) => ({ key: `trending:${symbol}`, query: symbol, symbol })),
    ...followed.map((symbol) => ({ key: `stock:${symbol}`, query: symbol, symbol })),
  ];
  const loaded = await loadWithSpacing(jobs, force);

  // Merge the three index feeds into one general section: same story often
  // shows up under more than one index, and interleaving three separate
  // fetches by arrival order would read oddly next to a single "Market"
  // section, so this re-sorts by recency and dedupes by id.
  const generalItems = GENERAL_INDEX_SYMBOLS.flatMap((symbol) => loaded.get(`general:${symbol}`) ?? []);
  const seenGeneralIds = new Set<string>();
  const general = generalItems
    .filter((item) => (seenGeneralIds.has(item.id) ? false : (seenGeneralIds.add(item.id), true)))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, GENERAL_SECTION_LIMIT);

  const sections: NewsSection[] = [{ key: 'general', title: 'Market', items: general }];

  const trendingItems = trending.flatMap((symbol) => loaded.get(`trending:${symbol}`) ?? []);
  if (trendingItems.length > 0) {
    sections.push({ key: 'trending', title: "Today's biggest movers", items: trendingItems });
  }

  for (const symbol of followed) {
    const items = loaded.get(`stock:${symbol}`) ?? [];
    sections.push({ key: `stock:${symbol}`, title: tickerOf(symbol)?.name ?? symbol, symbol, items });
  }

  return sections;
}
