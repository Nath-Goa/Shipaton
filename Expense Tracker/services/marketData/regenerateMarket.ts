import { resetMarketCache } from '@/services/marketData/mockMarketData';
import { useMarketStore } from '@/store/useMarketStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';

// Re-seeds every mock stock's simulated price history. Existing portfolio
// holdings/trades are priced against the OLD series, so they'd be nonsensical
// against a freshly-generated one — reset the portfolio alongside it (the
// caller is responsible for warning the user before invoking this).
export function regenerateMarket(): void {
  useMarketStore.getState().bumpEpoch();
  resetMarketCache();
  // Every portfolio's holdings are stale against the freshly-generated price
  // series, not just the active one.
  usePortfolioStore.getState().resetAllPortfolios();
}
