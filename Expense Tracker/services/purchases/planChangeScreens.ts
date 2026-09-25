import { router } from 'expo-router';

import type { Tier } from '@/constants/subscription';

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, max: 2 };

// The one place that decides which screen follows a plan change, so every
// path that switches plans (the paywall hook, the plan screen, the judge
// shortcut in Settings) agrees:
//   paid → Free       the quiet goodbye screen (app/plan-goodbye.tsx)
//   Max → Pro         the Pro celebration, opening with a "sad to see you
//                     leave Max" note (app/purchase-success.tsx, `from`)
//   anything higher   the regular celebration
// Returns false when the tier didn't actually change, so the caller can say
// something itself instead of celebrating a switch that didn't happen.
export function showPlanChangeScreen(from: Tier, to: Tier): boolean {
  if (from === to) return false;
  if (to === 'free') {
    router.push({ pathname: '/plan-goodbye', params: { from } });
    return true;
  }
  const downgrade = TIER_RANK[to] < TIER_RANK[from];
  router.push({ pathname: '/purchase-success', params: downgrade ? { tier: to, from } : { tier: to } });
  return true;
}
