import { useEffect } from 'react';

import { useQuotes } from '@/hooks/useQuotes';
import { usePortfolioStore } from '@/store/usePortfolioStore';

const POLL_MS = 5000;

// Headless — mounted once at the root so a limit order can fill no matter
// which tab is open, the same way PriceAlertWatcher covers watchlist
// alerts. Watches every symbol with a pending order across ALL portfolios,
// not just the active one, since a Max user can have several. The selector
// below returns a fresh array each call, so this re-renders on any
// portfolio-store change — harmless for a headless component, and
// useQuotes itself keys its polling off symbols.join(',') so that doesn't
// restart the poll unnecessarily.
export function LimitOrderWatcher() {
  const symbols = usePortfolioStore((s) => {
    const set = new Set<string>();
    for (const p of Object.values(s.portfolios)) {
      for (const o of p.limitOrders) set.add(o.symbol);
    }
    return Array.from(set).sort();
  });
  const processLimitOrders = usePortfolioStore((s) => s.processLimitOrders);
  const { quotes } = useQuotes(symbols, POLL_MS);

  useEffect(() => {
    if (symbols.length === 0) return;
    processLimitOrders((symbol) => quotes.get(symbol)?.price);
  }, [quotes, symbols.length, processLimitOrders]);

  return null;
}
