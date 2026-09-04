import type { Trade } from '@/store/usePortfolioStore';

export type PairedSell = { sell: Trade; buy: Trade; heldMs: number; gainPct: number };

// A Trade record doesn't carry its own cost basis at sale time, so this
// pairs a sell with its most-recent prior buy of the same symbol — a
// heuristic (most-recent-buy, not true FIFO cost-basis accounting), good
// enough for an educational nudge or a personal-record number, not for
// real accounting.
export function pairSellWithPriorBuy(sell: Trade, allTrades: Trade[]): PairedSell | null {
  const priorBuy = allTrades
    .filter((t) => t.symbol === sell.symbol && t.side === 'buy' && t.date < sell.date)
    .sort((a, b) => b.date - a.date)[0];
  if (!priorBuy) return null;
  const heldMs = sell.date - priorBuy.date;
  const gainPct = ((sell.price - priorBuy.price) / priorBuy.price) * 100;
  return { sell, buy: priorBuy, heldMs, gainPct };
}

export function bestTradeGainPct(trades: Trade[]): number | null {
  let best: number | null = null;
  for (const sell of trades.filter((t) => t.side === 'sell')) {
    const paired = pairSellWithPriorBuy(sell, trades);
    if (paired && (best === null || paired.gainPct > best)) best = paired.gainPct;
  }
  return best;
}
