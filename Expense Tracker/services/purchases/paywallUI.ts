import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { ENTITLEMENT_MAX, ENTITLEMENT_PRO, type Tier } from '@/constants/subscription';
import { fetchCurrentTier, fetchOfferingForTier, isPurchasesConfigured, tierFromCustomerInfo } from '@/services/purchases/revenuecat';

export { PAYWALL_RESULT };

export type PresentPaywallOutcome =
  | { shown: true; result: PAYWALL_RESULT; tier?: Tier }
  | { shown: false; reason: 'not_configured' };

// PAYWALL_RESULT tells us a purchase/restore happened, but not the
// resulting tier directly (a restore especially could land on either paid
// tier) — fetch the authoritative post-purchase tier so the caller can
// update its UI immediately rather than waiting a tick for the
// customerInfo listener in app/_layout.tsx to catch up (which still runs
// regardless, as the durable source of truth).
async function resolveOutcome(result: PAYWALL_RESULT): Promise<PresentPaywallOutcome> {
  if (result !== PAYWALL_RESULT.PURCHASED && result !== PAYWALL_RESULT.RESTORED) {
    return { shown: true, result };
  }
  const tier = await fetchCurrentTier();
  return { shown: true, result, tier: tier ?? undefined };
}

// The official RevenueCat Paywall UI, presented with the tier's own Offering
// ("pro" or "max" in the RevenueCat dashboard, each holding "monthly" /
// "yearly" / "lifetime" packages) so the paywall lists the right products.
// Uses whatever paywall template is configured in the dashboard for that
// offering, or RevenueCat's default template if none has been designed yet.
export async function presentPaywallForTier(tier: Exclude<Tier, 'free'>): Promise<PresentPaywallOutcome> {
  if (!isPurchasesConfigured()) return { shown: false, reason: 'not_configured' };
  try {
    const offering = await fetchOfferingForTier(tier);
    const result = await RevenueCatUI.presentPaywall({ offering: offering ?? undefined });
    return resolveOutcome(result);
  } catch {
    // A "configured" but invalid/placeholder key (present, but rejected by
    // RevenueCat's servers) reaches here rather than crashing the tap —
    // callers treat this the same as not_configured and fall back to the
    // demo-mode upgrade screen.
    return { shown: false, reason: 'not_configured' };
  }
}

// Modern "only show it if they need it" pattern: skips the paywall entirely
// when the customer already holds the required entitlement. Used on
// Max-only feature gates so tapping a locked feature can go straight to a
// purchase flow instead of just routing to the Settings paywall screen.
export async function presentPaywallIfNeededForTier(tier: Exclude<Tier, 'free'>): Promise<PresentPaywallOutcome> {
  if (!isPurchasesConfigured()) return { shown: false, reason: 'not_configured' };
  try {
    const offering = await fetchOfferingForTier(tier);
    const requiredEntitlementIdentifier = tier === 'max' ? ENTITLEMENT_MAX : ENTITLEMENT_PRO;
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier,
      offering: offering ?? undefined,
    });
    return resolveOutcome(result);
  } catch {
    return { shown: false, reason: 'not_configured' };
  }
}

export async function presentCustomerCenter(): Promise<{ ok: boolean; message?: string }> {
  if (!isPurchasesConfigured()) return { ok: false, message: 'Subscription management is not available in demo mode.' };
  try {
    await RevenueCatUI.presentCustomerCenter();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Could not open subscription management.' };
  }
}

// Re-exported so screens that only need the tier-detection logic don't have
// to import from two different purchases modules.
export { tierFromCustomerInfo };
