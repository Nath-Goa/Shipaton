import { useEffect, useRef } from 'react';

import { triggerFeedback } from '@/constants/animations';
import { useQuotes } from '@/hooks/useQuotes';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useToastStore } from '@/store/useToastStore';
import { money } from '@/utils/money';

// A notable move, worth interrupting the user for.
const ALERT_THRESHOLD_PCT = 3;
const POLL_MS = 5000;

// Headless — mounted once at the root so watchlist price alerts fire no
// matter which tab is open. This is an in-app-only substitute for a real
// push alert: since there's no backend, it can only watch while the app is
// actually running, unlike a true background price alert would.
export function PriceAlertWatcher() {
  const watchlist = usePortfolioStore((s) => s.watchlist);
  const showToast = useToastStore((s) => s.show);
  const { quotes } = useQuotes(watchlist, POLL_MS);
  // Per-symbol reference price the % move is measured against — reset
  // after each alert so the next move is measured fresh, and seeded (not
  // alerted on) the first time a symbol is ever seen.
  const baselines = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const symbol of Array.from(baselines.current.keys())) {
      if (!watchlist.includes(symbol)) baselines.current.delete(symbol);
    }
  }, [watchlist]);

  useEffect(() => {
    for (const [symbol, quote] of quotes) {
      const baseline = baselines.current.get(symbol);
      if (baseline === undefined) {
        baselines.current.set(symbol, quote.price);
        continue;
      }
      const changePct = ((quote.price - baseline) / baseline) * 100;
      if (Math.abs(changePct) < ALERT_THRESHOLD_PCT) continue;

      triggerFeedback(changePct >= 0 ? 'success' : 'error');
      showToast(`${symbol} is ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(1)}% — now ${money(quote.price)}`);
      baselines.current.set(symbol, quote.price);
    }
  }, [quotes, showToast]);

  return null;
}
