import { useCallback, useEffect, useState } from 'react';

import { getQuote } from '@/services/marketData/marketData';
import type { Quote } from '@/types/stock';

// Polls the (fully local, in-memory) mock quote engine for a fixed list of
// symbols. Cheap enough to poll on an interval — there's no network call
// behind it, just reads of the cached random-walk history.
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
