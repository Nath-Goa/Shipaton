import { router } from 'expo-router';
import { useCallback } from 'react';

import type { Tier } from '@/constants/subscription';
import { PAYWALL_RESULT, presentPaywallIfNeededForTier } from '@/services/purchases/paywallUI';
import { useSettingsStore } from '@/store/useSettingsStore';

// Every tier-specific "Upgrade to Pro/Max" call site in the app funnels
// through here: opens RevenueCat's native paywall for that tier if
// configured (skipping it entirely when the entitlement's already held),
// applies the resulting tier immediately for a responsive UI (the
// customerInfo listener in app/_layout.tsx also picks it up, this just
// avoids waiting on it), and falls back to the full plan comparison screen
// in demo mode (no RevenueCat key configured yet).
export function useUpgradeToTier() {
  const setTier = useSettingsStore((s) => s.setTier);

  return useCallback(
    async (tier: Exclude<Tier, 'free'>) => {
      const outcome = await presentPaywallIfNeededForTier(tier);
      if (!outcome.shown) {
        router.push('/settings/upgrade');
        return;
      }
      if (outcome.result === PAYWALL_RESULT.PURCHASED || outcome.result === PAYWALL_RESULT.RESTORED) {
        if (outcome.tier) setTier(outcome.tier);
      }
    },
    [setTier]
  );
}
