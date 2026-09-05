import { useCallback, useEffect, useState } from 'react';

import { getQuote } from '@/services/marketData/marketData';
import type { Quote } from '@/types/stock';

// Polls marketData.getQuote for a fixed list of symbols. Each call only
// ever reads the in-memory quote cache synchronously; any actual network
// refresh it kicks off is separately TTL-gated and throttled (see
// liveMarketData.ts) so polling here doesn't multiply real requests.
// Defaults to once a minute — fresh enough for a background
// watchlist/summary without hammering the live-data providers on every
// screen that shows a price. Pass `0` for screens that should hold steady
// once loaded instead (see markets/index.tsx and markets/practice.tsx,
// which pair this with a focus- or mount-triggered one-time refresh plus a
// manual refresh action).
const DEFAULT_POLL_MS = 60_000;

function sameQuotes(a: Map<string, Quote>, b: Map<string, Quote>): boolean {
  if (a.size !== b.size) return false;
  for (const [symbol, next] of b) {
    const prev = a.get(symbol);
    if (!prev) return false;
    if (prev.price !== next.price || prev.changeAbs !== next.changeAbs || prev.changePct !== next.changePct) {
      return false;
    }
  }
  return true;
}

export function useQuotes(
  symbols: string[],
  pollMs = DEFAULT_POLL_MS
): { quotes: Map<string, Quote>; refresh: () => void } {
  const key = symbols.join(',');
  const [quotes, setQuotes] = useState<Map<string, Quote>>(() => new Map());

  const refresh = useCallback(() => {
    // Built outside the updater: getQuote schedules background refreshes as
    // a side effect, and a state updater can legitimately run more than once.
    const next = new Map<string, Quote>();
    for (const symbol of symbols) next.set(symbol, getQuote(symbol));
    // Returning the previous map when nothing moved skips the re-render
    // entirely — most refreshes change nothing, and a tap landing behind a
    // 27-row re-render is felt as button lag, not as a slow list.
    setQuotes((prev) => (sameQuotes(prev, next) ? prev : next));
    // key is a stable proxy for the symbols array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    refresh();
    if (pollMs <= 0) return;
    const timer = setInterval(refresh, pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  return { quotes, refresh };
}
