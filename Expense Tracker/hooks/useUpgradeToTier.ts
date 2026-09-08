import { router } from 'expo-router';
import { useCallback } from 'react';

import type { Tier } from '@/constants/subscription';
import { presentPaywallIfNeededForTier } from '@/services/purchases/paywallUI';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';

// Every tier-specific "Upgrade to Pro/Max" call site in the app funnels
// through here: opens RevenueCat's native paywall for that tier if
// configured (skipping it entirely when the tier's already held), applies
// the resulting tier immediately for a responsive UI (the customerInfo
// listener in app/_layout.tsx also picks it up, this just avoids waiting on
// it), and falls back to the full plan comparison screen in demo mode (no
// RevenueCat key configured yet).
export function useUpgradeToTier() {
  const setTier = useSettingsStore((s) => s.setTier);
  const showToast = useToastStore((s) => s.show);

  return useCallback(
    async (tier: Exclude<Tier, 'free'>) => {
      const outcome = await presentPaywallIfNeededForTier(tier);
      if (!outcome.shown) {
        // Demo mode has a real destination — the plan comparison screen.
        // A genuine paywall failure doesn't, and routing there would show
        // demo-mode copy to someone whose keys are working fine.
        if (outcome.reason === 'not_configured') router.push('/settings/upgrade');
        else showToast(outcome.message);
        return;
      }
      // NOT_PRESENTED here means they already hold the tier — adopt it, so a
      // local tier that had drifted from the store (a reinstall, a
      // subscription bought on another device) corrects itself on the tap.
      if (outcome.tier) setTier(outcome.tier);
    },
    [setTier, showToast]
  );
}
