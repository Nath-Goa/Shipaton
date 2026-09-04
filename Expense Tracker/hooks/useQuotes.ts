import { useCallback, useEffect, useState } from 'react';

import { getQuote } from '@/services/marketData/marketData';
import type { Quote } from '@/types/stock';

// Polls marketData.getQuote for a fixed list of symbols. Safe to poll on a
// tight interval even though the live engine sits behind this now — each
// call only ever reads the in-memory quote cache synchronously; any actual
// network refresh it kicks off is separately TTL-gated (see
// liveMarketData.ts) so polling here doesn't multiply real requests.
export function useQuotes(symbols: string[], pollMs = 3000): { quotes: Map<string, Quote>; refresh: () => void } {
  const key = symbols.join(',');
  const [quotes, setQuotes] = useState<Map<string, Quote>>(() => new Map());

  const refresh = useCallback(() => {
    setQuotes(new Map(symbols.map((s) => [s, getQuote(s)])));
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
