import { router } from 'expo-router';
import { useCallback, useRef } from 'react';

import type { Tier } from '@/constants/subscription';
import { useAgePermissions, useIsJudgeMode } from '@/hooks/useAgePermissions';
import { PAYWALL_RESULT, presentPaywallAsJudge, presentPaywallIfNeededForTier } from '@/services/purchases/paywallUI';
import { useAgeStore } from '@/store/useAgeStore';
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
  const grantJudgeAccess = useAgeStore((s) => s.grantJudgeAccess);
  const offerJudgeOfflineFallback = useAgeStore((s) => s.offerJudgeOfflineFallback);
  // Callers like UpgradeBanner have no loading state of their own around
  // this call, so a double-tap while a paywall/Test-Store round trip is
  // still in flight (up to ~1.2s with paywallUI.ts's post-purchase retry)
  // could fire a second one concurrently. One in-flight guard here covers
  // every call site at once rather than pushing a loading flag onto each.
  const pendingRef = useRef(false);

  return useCallback(
    async (tier: Exclude<Tier, 'free'>) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      try {
        // TEMPORARY, hackathon judging only (constants/judgeMode.ts). Shows the
        // real RevenueCat Test Store paywall, then requires its simulated
        // purchase to produce the expected entitlement before access unlocks.
        if (isJudge) {
          const outcome = await presentPaywallAsJudge(tier);
          if (outcome.status === 'activated') {
            grantJudgeAccess(outcome.tier, 'test_store');
            setTier(outcome.tier);
            router.push({ pathname: '/purchase-success', params: { tier: outcome.tier } });
          } else if (outcome.status === 'cancelled') {
            showToast('Test purchase cancelled — your plan was not changed.');
          } else {
            offerJudgeOfflineFallback();
            showToast(outcome.message);
            router.push('/settings/upgrade');
          }
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
        // Only a purchase that actually granted a paid tier gets the
        // celebration; a restore or an already-held tier doesn't.
        if (outcome.result === PAYWALL_RESULT.PURCHASED && outcome.tier && outcome.tier !== 'free') {
          router.push({ pathname: '/purchase-success', params: { tier: outcome.tier } });
        }
      } finally {
        pendingRef.current = false;
      }
    },
    [setTier, showToast, agePermissions, isJudge, grantJudgeAccess, offerJudgeOfflineFallback]
  );
}
