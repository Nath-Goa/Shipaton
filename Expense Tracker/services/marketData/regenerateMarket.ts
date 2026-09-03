import { isLiveMarketDataConfigured, resetMarketCache } from '@/services/marketData/marketData';
import { useMarketStore } from '@/store/useMarketStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';

// Mock mode: re-seeds every mock stock's simulated price history. Live mode:
// real prices can't be "regenerated", so this just forces a fresh refetch
// bypassing the normal cache TTLs (see resetMarketCache in
// liveMarketData.ts). Either way, existing portfolio holdings/trades are
// priced against the OLD series, so they'd be nonsensical against the new
// one — reset the portfolio alongside it (the caller is responsible for
// warning the user before invoking this).
export function regenerateMarket(): void {
  if (!isLiveMarketDataConfigured()) useMarketStore.getState().bumpEpoch();
  resetMarketCache();
  // Every portfolio's holdings are stale against the freshly-generated price
  // series, not just the active one.
  usePortfolioStore.getState().resetAllPortfolios();
}
