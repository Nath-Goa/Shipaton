import { TICKERS } from '@/constants/tickers';
import { getFullHistory } from '@/services/marketData/marketData';
import { STARTING_CASH, type Holding, type PortfolioData } from '@/store/usePortfolioStore';
import type { Quote } from '@/types/stock';
import { parseDateLocal, toDateStr } from '@/utils/date';

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

export type BenchmarkPoint = { date: string; portfolioPct: number; benchmarkPct: number };

function replayPortfolioAtDates(portfolio: PortfolioData, dates: string[]) {
  const trades = [...portfolio.trades].sort((a, b) => a.date - b.date);
  const dividends = [...portfolio.dividends].sort((a, b) => a.date - b.date);
  const holdings = new Map<string, number>();
  const snapshots: Array<{ date: string; cash: number; holdings: Map<string, number> }> = [];
  let cash = STARTING_CASH;
  let tradeIndex = 0;
  let dividendIndex = 0;

  for (const date of dates) {
    const cutoffMs = parseDateLocal(date).getTime() + 24 * 60 * 60 * 1000 - 1;
    while (tradeIndex < trades.length && trades[tradeIndex].date <= cutoffMs) {
      const trade = trades[tradeIndex++];
      cash += trade.side === 'buy' ? -trade.total : trade.total;
      holdings.set(trade.symbol, (holdings.get(trade.symbol) ?? 0) + (trade.side === 'buy' ? trade.qty : -trade.qty));
    }
    while (dividendIndex < dividends.length && dividends[dividendIndex].date <= cutoffMs) {
      cash += dividends[dividendIndex++].amount;
    }
    snapshots.push({ date, cash, holdings: new Map(holdings) });
  }

  return snapshots;
}

// Reconstructs the portfolio's net-worth curve (cash flow from trades and
// dividends, replayed day by day, plus holdings priced at that day's close)
// and compares its cumulative % return against an equal-weight benchmark of
// every listed ticker over the same window. Dividends aside, this doesn't
// need any data beyond what's already in the trade/dividend log and the
// existing price history — no separate portfolio-value tracking required.
export function computePortfolioVsBenchmark(portfolio: PortfolioData, days = 90): BenchmarkPoint[] {
  if (portfolio.trades.length === 0) return [];

  const barsBySymbol = new Map<string, Map<string, number>>(
    TICKERS.map((t) => [t.symbol, new Map(getFullHistory(t.symbol).map((b) => [b.date, b.close]))])
  );
  for (const symbol of new Set(portfolio.trades.map((t) => t.symbol))) {
    if (!barsBySymbol.has(symbol)) {
      barsBySymbol.set(symbol, new Map(getFullHistory(symbol).map((b) => [b.date, b.close])));
    }
  }

  const spine = TICKERS.length ? Array.from(barsBySymbol.get(TICKERS[0].symbol)?.keys() ?? []) : [];
  if (spine.length === 0) return [];

  const firstTradeMs = Math.min(...portfolio.trades.map((t) => t.date));
  const firstTradeDate = toDateStr(new Date(firstTradeMs));
  const firstIdx = spine.indexOf(firstTradeDate);
  const startIdx = Math.max(0, spine.length - days, firstIdx >= 0 ? firstIdx : 0);
  const dates = spine.slice(startIdx);
  if (dates.length === 0) return [];

  const benchmarkStart = TICKERS.map((t) => barsBySymbol.get(t.symbol)?.get(dates[0]));

  const points: BenchmarkPoint[] = [];
  let portfolioStartValue: number | null = null;

  for (const { date, cash, holdings } of replayPortfolioAtDates(portfolio, dates)) {
    let holdingsValue = 0;
    for (const [symbol, qty] of holdings) {
      if (qty <= 0) continue;
      const price = barsBySymbol.get(symbol)?.get(date);
      if (price != null) holdingsValue += price * qty;
    }

    const value = cash + holdingsValue;
    if (portfolioStartValue === null) portfolioStartValue = value;
    const portfolioPct = portfolioStartValue ? ((value - portfolioStartValue) / portfolioStartValue) * 100 : 0;

    let benchSum = 0;
    let benchCount = 0;
    TICKERS.forEach((t, i) => {
      const startPrice = benchmarkStart[i];
      const price = barsBySymbol.get(t.symbol)?.get(date);
      if (startPrice != null && price != null) {
        benchSum += ((price - startPrice) / startPrice) * 100;
        benchCount++;
      }
    });
    const benchmarkPct = benchCount ? benchSum / benchCount : 0;

    points.push({ date, portfolioPct, benchmarkPct });
  }

  return points;
}

export type NetWorthPoint = { date: string; cash: number; holdingsValue: number; netWorth: number };

// Reconstructs cash + holdings-value day by day the same way
// computePortfolioVsBenchmark does, but only needs the symbols this
// portfolio has actually traded — no benchmark to compute here, so no need
// to pull bars for the full TICKERS universe.
export function computeNetWorthHistory(portfolio: PortfolioData, days = 90): NetWorthPoint[] {
  if (portfolio.trades.length === 0) return [];

  const symbols = Array.from(new Set(portfolio.trades.map((t) => t.symbol)));
  const barsBySymbol = new Map<string, Map<string, number>>(
    symbols.map((s) => [s, new Map(getFullHistory(s).map((b) => [b.date, b.close]))])
  );

  // Anchor the date range on whichever traded symbol has the longest bar
  // history, not just the first one encountered — under live market data
  // (unlike the fully-deterministic mock engine, where every symbol always
  // has identical-length history) different symbols can have different
  // cached lengths, and picking an arbitrary one could needlessly truncate
  // the whole chart to that symbol's shorter range.
  let spine: string[] = [];
  for (const symbol of symbols) {
    const keys = Array.from(barsBySymbol.get(symbol)?.keys() ?? []);
    if (keys.length > spine.length) spine = keys;
  }
  if (spine.length === 0) return [];

  const firstTradeMs = Math.min(...portfolio.trades.map((t) => t.date));
  const firstTradeDate = toDateStr(new Date(firstTradeMs));
  const firstIdx = spine.indexOf(firstTradeDate);
  const startIdx = Math.max(0, spine.length - days, firstIdx >= 0 ? firstIdx : 0);
  const dates = spine.slice(startIdx);
  if (dates.length === 0) return [];

  const points: NetWorthPoint[] = [];
  for (const { date, cash, holdings } of replayPortfolioAtDates(portfolio, dates)) {
    let holdingsValue = 0;
    for (const [symbol, qty] of holdings) {
      if (qty <= 0) continue;
      const price = barsBySymbol.get(symbol)?.get(date);
      if (price != null) holdingsValue += price * qty;
    }

    points.push({ date, cash, holdingsValue, netWorth: cash + holdingsValue });
  }

  return points;
}
