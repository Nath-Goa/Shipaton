import { router } from 'expo-router';
import { useCallback } from 'react';

import { TIER_LABELS, type Tier } from '@/constants/subscription';
import { useAgePermissions, useIsJudgeMode } from '@/hooks/useAgePermissions';
import { presentPaywallAsJudge, presentPaywallIfNeededForTier } from '@/services/purchases/paywallUI';
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
  const agePermissions = useAgePermissions();
  const isJudge = useIsJudgeMode();

  return useCallback(
    async (tier: Exclude<Tier, 'free'>) => {
      // TEMPORARY, hackathon judging only (constants/judgeMode.ts). Shows the
      // real RevenueCat paywall — that integration is the thing being judged,
      // so it must not be hidden — then grants the tier however they leave it.
      if (isJudge) {
        const granted = await presentPaywallAsJudge(tier);
        setTier(granted.tier);
        showToast(
          granted.viaRevenueCat
            ? `${TIER_LABELS[granted.tier]} active via RevenueCat.`
            : `${TIER_LABELS[granted.tier]} unlocked — free while judging.`
        );
        return;
      }
      // Because every upgrade CTA in the app routes through here, one check
      // covers all of them — no paywall is ever presented to a minor, and
      // no purchase flow starts.
      if (!agePermissions.purchases) {
        showToast('Subscriptions are only available on accounts aged 18 and over.');
        return;
      }
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
    [setTier, showToast, agePermissions, isJudge]
  );
}
