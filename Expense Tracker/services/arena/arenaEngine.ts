import { gaussian, hashString, mulberry32 } from '@/utils/prng';

// Self-contained engine for the "$100k vs AI" arena — deliberately separate
// from services/marketData (the real/mock price engine every other screen
// reads). An arena session is short, fast-forwardable, and different every
// replay; the shared market data is none of those, and a bug here must
// never be able to touch a symbol's real price history.

export type ArenaDifficulty = 'cautious' | 'balanced' | 'aggressive';

// skill = probability the bot reads a tick's momentum correctly (vs. acting
// on noise); riskFraction = share of its free cash it commits per trade.
// Aggressive is both a better reader AND a bigger bettor — a harder
// opponent on both axes, not just a riskier one.
export const DIFFICULTY_PROFILE: Record<ArenaDifficulty, { skill: number; riskFraction: number; label: string }> = {
  cautious: { skill: 0.52, riskFraction: 0.08, label: 'Cautious' },
  balanced: { skill: 0.6, riskFraction: 0.15, label: 'Balanced' },
  aggressive: { skill: 0.7, riskFraction: 0.25, label: 'Aggressive' },
};

export type ArenaSymbol = { symbol: string; name: string; startPrice: number; vol: number };

/** One seeded price path per symbol, `ticks + 1` points long (index 0 = start price). */
export function generatePricePath(seed: string, startPrice: number, vol: number, ticks: number): number[] {
  const rand = mulberry32(hashString(seed));
  const path = [startPrice];
  let price = startPrice;
  for (let i = 0; i < ticks; i++) {
    const move = gaussian(rand) * vol;
    price = Math.max(price * (1 + move), 0.5);
    path.push(price);
  }
  return path;
}

export type ArenaHolding = { qty: number; avgCost: number };
export type ArenaPortfolio = { cash: number; holdings: Record<string, ArenaHolding> };

export function portfolioValue(portfolio: ArenaPortfolio, prices: Record<string, number>): number {
  let value = portfolio.cash;
  for (const [symbol, h] of Object.entries(portfolio.holdings)) {
    value += (prices[symbol] ?? h.avgCost) * h.qty;
  }
  return value;
}

function buy(portfolio: ArenaPortfolio, symbol: string, price: number, spend: number): ArenaPortfolio {
  const affordable = Math.min(spend, portfolio.cash);
  const qty = Math.floor(affordable / price);
  if (qty <= 0) return portfolio;
  const cost = qty * price;
  const existing = portfolio.holdings[symbol];
  const newQty = (existing?.qty ?? 0) + qty;
  const newAvgCost = existing ? (existing.avgCost * existing.qty + cost) / newQty : price;
  return {
    cash: portfolio.cash - cost,
    holdings: { ...portfolio.holdings, [symbol]: { qty: newQty, avgCost: newAvgCost } },
  };
}

function sellAll(portfolio: ArenaPortfolio, symbol: string, price: number): ArenaPortfolio {
  const existing = portfolio.holdings[symbol];
  if (!existing) return portfolio;
  const proceeds = existing.qty * price;
  const holdings = { ...portfolio.holdings };
  delete holdings[symbol];
  return { cash: portfolio.cash + proceeds, holdings };
}

/**
 * Advance the AI bot's portfolio by one tick. A simple, honest strategy: for
 * each symbol, read the last tick's return; act on it correctly with
 * probability `skill`, otherwise act on the opposite/random read. A holding
 * that's now read as "sell" is fully closed; a "buy" read commits
 * `riskFraction` of current free cash, split evenly across symbols
 * currently reading "buy" this tick.
 */
export function stepBot(
  portfolio: ArenaPortfolio,
  symbols: string[],
  pricesNow: Record<string, number>,
  pricesPrev: Record<string, number>,
  profile: { skill: number; riskFraction: number },
  rand: () => number
): ArenaPortfolio {
  let next = portfolio;
  const buys: string[] = [];

  for (const symbol of symbols) {
    const now = pricesNow[symbol];
    const prev = pricesPrev[symbol];
    if (!(now > 0) || !(prev > 0)) continue;
    const momentum = now - prev;
    const trueSignal: 'buy' | 'sell' | 'hold' = momentum > 0 ? 'buy' : momentum < 0 ? 'sell' : 'hold';
    const readCorrectly = rand() < profile.skill;
    const signal = readCorrectly ? trueSignal : trueSignal === 'buy' ? 'sell' : trueSignal === 'sell' ? 'buy' : 'hold';

    if (signal === 'sell' && next.holdings[symbol]) {
      next = sellAll(next, symbol, now);
    } else if (signal === 'buy') {
      buys.push(symbol);
    }
  }

  if (buys.length > 0) {
    const budget = (next.cash * profile.riskFraction) / buys.length;
    for (const symbol of buys) {
      next = buy(next, symbol, pricesNow[symbol], budget);
    }
  }

  return next;
}
