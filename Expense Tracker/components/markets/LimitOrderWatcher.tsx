import { useEffect, useMemo } from 'react';

import { useQuotes } from '@/hooks/useQuotes';
import { usePortfolioStore } from '@/store/usePortfolioStore';

const POLL_MS = 5000;

// Headless — mounted once at the root so a limit order can fill no matter
// which tab is open, the same way PriceAlertWatcher covers watchlist
// alerts. Watches every symbol with a pending order across ALL portfolios,
// not just the active one, since a Max user can have several.
export function LimitOrderWatcher() {
  // Select the store's own `portfolios` reference (stable within a single
  // state snapshot) and derive `symbols` in a useMemo instead of inside the
  // selector. A zustand selector MUST return a referentially-stable result
  // for an unchanged state snapshot — returning a freshly-built array (via
  // Array.from/.sort()) on every invocation breaks that contract and sends
  // React's useSyncExternalStore into an infinite re-render loop ("Maximum
  // update depth exceeded") rather than just causing extra renders.
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const processLimitOrders = usePortfolioStore((s) => s.processLimitOrders);
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const p of Object.values(portfolios)) {
      for (const o of p.limitOrders) set.add(o.symbol);
    }
    return Array.from(set).sort();
  }, [portfolios]);
  const { quotes } = useQuotes(symbols, POLL_MS);

  useEffect(() => {
    if (symbols.length === 0) return;
    processLimitOrders((symbol) => quotes.get(symbol)?.price);
  }, [quotes, symbols.length, processLimitOrders]);

  return null;
}
