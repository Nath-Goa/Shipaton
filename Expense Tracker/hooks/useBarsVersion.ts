import { useSyncExternalStore } from 'react';

import { getBarsVersion, subscribeBarsChanged } from '@/services/marketData/marketData';

// A number that changes whenever real price history lands in the market
// data cache. Put it in the deps of any useMemo that reads getFullHistory /
// getHistory, so mock bars shown on first paint get replaced once the live
// ones arrive instead of sticking for the whole visit.
export function useBarsVersion(): number {
  return useSyncExternalStore(subscribeBarsChanged, getBarsVersion);
}
