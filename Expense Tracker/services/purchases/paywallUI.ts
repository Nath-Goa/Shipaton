import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import type { Tier } from '@/constants/subscription';
import {
  fetchCurrentTier,
  fetchOfferingForTier,
  isPurchasesConfigured,
  tierFromCustomerInfo,
  tierSatisfies,
} from '@/services/purchases/revenuecat';

export { PAYWALL_RESULT };

export type PresentPaywallOutcome =
  | { shown: true; result: PAYWALL_RESULT; tier?: Tier }
  | { shown: false; reason: 'not_configured' }
  | { shown: false; reason: 'error'; message: string };

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
  } catch (e: any) {
    // A configured-but-failing paywall (no offering set up in the
    // dashboard, a product missing from Play Console, no network) is NOT
    // the same thing as demo mode, and telling someone with real keys to
    // "set up RevenueCat" sends them looking in the wrong place. Callers
    // get a distinct reason so they can say something true instead.
    return { shown: false, reason: 'error', message: e?.message || 'Could not open the paywall. Try again.' };
  }
}

// Modern "only show it if they need it" pattern: skips the paywall entirely
// when the customer already has the tier they're being asked to buy. Used
// on feature gates so tapping a locked feature can go straight to a
// purchase flow instead of just routing to the Settings paywall screen.
//
// Deliberately NOT RevenueCatUI.presentPaywallIfNeeded: that matches on one
// literal entitlement identifier, so a subscriber whose dashboard grants
// the umbrella ENTITLEMENT_APP (RevenueCat's own default for a project that
// hasn't split entitlements per tier) would never satisfy a required "pro"
// and would be shown the paywall again on every gated tap despite already
// paying. tierFromCustomerInfo is the single place that knows all three
// entitlement identifiers, so the "do they need it?" question is answered
// against that instead.
export async function presentPaywallIfNeededForTier(tier: Exclude<Tier, 'free'>): Promise<PresentPaywallOutcome> {
  if (!isPurchasesConfigured()) return { shown: false, reason: 'not_configured' };
  const current = await fetchCurrentTier();
  if (current && tierSatisfies(current, tier)) {
    return { shown: true, result: PAYWALL_RESULT.NOT_PRESENTED, tier: current };
  }
  return presentPaywallForTier(tier);
}

// TEMPORARY, hackathon judging only — see constants/judgeMode.ts.
//
// Judges are evaluating the RevenueCat integration, so they have to actually
// SEE the paywall; hiding it would hide the thing being judged. This shows
// the real one — real offering, real packages, real dashboard-designed
// template — and then grants the tier regardless of how they leave it, so
// closing the paywall is enough and nobody is ever charged.
//
// A real purchase still wins when there is one: a judge added as a Google
// Play licence tester goes through the genuine billing flow at no cost and
// lands on PURCHASED with a real entitlement, and that tier is what gets
// returned. So this degrades cleanly across all three situations — real
// purchase, paywall dismissed, and RevenueCat not configured at all (where
// no paywall can be shown and the grant is all that happens).
export async function presentPaywallAsJudge(
  tier: Exclude<Tier, 'free'>
): Promise<{ tier: Tier; viaRevenueCat: boolean; paywallShown: boolean }> {
  const outcome = await presentPaywallForTier(tier);
  const purchased =
    outcome.shown && (outcome.result === PAYWALL_RESULT.PURCHASED || outcome.result === PAYWALL_RESULT.RESTORED);

  if (purchased && outcome.tier) {
    return { tier: outcome.tier, viaRevenueCat: true, paywallShown: true };
  }
  return { tier, viaRevenueCat: false, paywallShown: outcome.shown };
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
