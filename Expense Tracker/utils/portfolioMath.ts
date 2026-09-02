import type { Holding } from '@/store/usePortfolioStore';
import type { Quote } from '@/types/stock';

export type PortfolioSummary = {
  holdingsValue: number;
  netWorth: number;
  todayPnl: number;
  todayPnlPct: number;
  allTimePnl: number;
  allTimePnlPct: number;
  positionsCount: number;
};

export function summarizePortfolio(
  cash: number,
  holdings: Record<string, Holding>,
  quotes: Map<string, Quote>
): PortfolioSummary {
  let holdingsValue = 0;
  let costBasis = 0;
  let todayPnl = 0;
  let positionsCount = 0;

  for (const holding of Object.values(holdings)) {
    if (holding.qty <= 0) continue;
    const quote = quotes.get(holding.symbol);
    const price = quote?.price ?? holding.avgCost;
    holdingsValue += price * holding.qty;
    costBasis += holding.avgCost * holding.qty;
    todayPnl += (quote?.changeAbs ?? 0) * holding.qty;
    positionsCount += 1;
  }

  const netWorth = cash + holdingsValue;
  const yesterdayValue = holdingsValue - todayPnl;
  const todayPnlPct = yesterdayValue !== 0 ? (todayPnl / yesterdayValue) * 100 : 0;
  const allTimePnl = holdingsValue - costBasis;
  const allTimePnlPct = costBasis !== 0 ? (allTimePnl / costBasis) * 100 : 0;

  return { holdingsValue, netWorth, todayPnl, todayPnlPct, allTimePnl, allTimePnlPct, positionsCount };
}
