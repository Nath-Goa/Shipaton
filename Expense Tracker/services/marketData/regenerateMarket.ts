import { resetMarketCache } from '@/services/marketData/marketData';
import { useMarketStore } from '@/store/useMarketStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';

// Live data is always attempted now, but any symbol can still be serving the
// mock engine's fallback (offline, or every provider currently failing/rate-
// limited — see liveMarketData.ts), so the mock series always needs a fresh
// seed too, not just a live-data cache reset. Real prices can't themselves
// be "regenerated"; resetMarketCache() forces a fresh refetch bypassing the
// normal cache TTLs instead. Either way, existing portfolio holdings/trades
// are priced against the OLD series, so they'd be nonsensical against the
// new one — reset the portfolio alongside it (the caller is responsible for
// warning the user before invoking this).
export function regenerateMarket(): void {
  useMarketStore.getState().bumpEpoch();
  resetMarketCache();
  // Every portfolio's holdings are stale against the freshly-generated price
  // series, not just the active one.
  usePortfolioStore.getState().resetAllPortfolios();
}
