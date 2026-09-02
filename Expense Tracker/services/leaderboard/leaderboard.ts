import { STARTING_CASH } from '@/store/usePortfolioStore';
import { useMarketStore } from '@/store/useMarketStore';
import { gaussian, hashString, mulberry32 } from '@/utils/prng';

// There's no backend or account system in this app, so a real multi-user
// leaderboard isn't possible — this is a *simulated* one instead. Each bot's
// track record is a seeded random walk (same technique as the mock stock
// price engine in services/marketData/mockMarketData.ts), so it's stable
// across renders/sessions and only shifts when the market itself is
// regenerated, rather than jittering randomly every time this screen opens.
// It is not a real other user's performance — always label it as simulated.

export type BotTrader = {
  id: string;
  name: string;
  avatar: string;
  netWorth: number;
  allTimePnlPct: number;
};

type BotDef = { id: string; name: string; avatar: string; skill: number; vol: number };

const BOTS: BotDef[] = [
  { id: 'momentum-max', name: 'MomentumMax', avatar: '🚀', skill: 0.55, vol: 0.02 },
  { id: 'trend-rider', name: 'TrendRider', avatar: '📈', skill: 0.4, vol: 0.016 },
  { id: 'diamond-hands', name: 'DiamondHands', avatar: '💎', skill: 0.35, vol: 0.018 },
  { id: 'value-seeker', name: 'ValueSeeker', avatar: '🔎', skill: 0.25, vol: 0.012 },
  { id: 'buy-the-dip', name: 'BuyTheDip', avatar: '🩹', skill: 0.2, vol: 0.014 },
  { id: 'steady-hand', name: 'SteadyHand', avatar: '🐢', skill: 0.15, vol: 0.006 },
  { id: 'safe-player', name: 'SafePlayer', avatar: '🛡️', skill: 0.05, vol: 0.004 },
  { id: 'quick-flip', name: 'QuickFlip', avatar: '⚡', skill: -0.05, vol: 0.03 },
];

// Matches HISTORY_DAYS in mockMarketData.ts — bots have "traded" for as long
// as the mock stocks have had price history.
const SIM_DAYS = 400;

function simulateBotReturnPct(botId: string, skill: number, vol: number, epoch: number): number {
  const rand = mulberry32(hashString(`bot:${botId}:${epoch}`));
  let cumulative = 1;
  for (let i = 0; i < SIM_DAYS; i++) {
    const dailyReturn = skill / SIM_DAYS + gaussian(rand) * vol;
    cumulative *= Math.max(1 + dailyReturn, 0.001);
  }
  return (cumulative - 1) * 100;
}

export function getLeaderboardBots(): BotTrader[] {
  const epoch = useMarketStore.getState().epoch;
  return BOTS.map((b) => {
    const allTimePnlPct = simulateBotReturnPct(b.id, b.skill, b.vol, epoch);
    return {
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      netWorth: STARTING_CASH * (1 + allTimePnlPct / 100),
      allTimePnlPct,
    };
  });
}
