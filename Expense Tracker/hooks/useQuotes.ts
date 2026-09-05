import { useCallback, useEffect, useState } from 'react';

import { getQuote } from '@/services/marketData/marketData';
import type { Quote } from '@/types/stock';

// Polls marketData.getQuote for a fixed list of symbols. Safe to poll even
// though the live engine sits behind this now — each call only ever reads
// the in-memory quote cache synchronously; any actual network refresh it
// kicks off is separately TTL-gated and throttled (see liveMarketData.ts)
// so polling here doesn't multiply real requests.
//
// The default interval is deliberately far longer than it used to be: a
// quote's underlying data can only change once per its 5-minute TTL, so the
// old 3s poll was resampling identical values ~100x per change and handing
// every consumer a brand-new Map each time. On the Markets screen that
// re-rendered all 27 rows every 3 seconds, and a tap landing mid-render
// waits behind it — which is felt as button lag, not as a slow list.
const DEFAULT_POLL_MS = 10_000;

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
    // entirely, which is the point — most polls change nothing.
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
