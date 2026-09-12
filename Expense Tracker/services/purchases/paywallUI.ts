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
  // RevenueCat's own SDK cache is normally already updated by the time
  // PURCHASED/RESTORED resolves, but a transient hiccup fetching it here
  // shouldn't read as "the purchase didn't grant anything" — that's the
  // difference between a real user seeing "still syncing, try Restore" and
  // a judge being dropped straight to the offline fallback moments after a
  // real Test Store purchase actually succeeded. A couple of short retries
  // costs under a second and removes most of that false negative.
  let tier: Tier | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    tier = await fetchCurrentTier();
    if (tier && tier !== 'free') break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400));
  }
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
    if (!offering) {
      return {
        shown: false,
        reason: 'error',
        message: `The ${tier === 'pro' ? 'Pro' : 'Max'} plan is temporarily unavailable. Please try again later.`,
      };
    }
    // Always provide an escape hatch. Cancelling never grants access, and a
    // dashboard edit must not turn an upgrade surface into a hard gate.
    const result = await RevenueCatUI.presentPaywall({ offering, displayCloseButton: true });
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
export type JudgePaywallOutcome =
  | { status: 'activated'; tier: Exclude<Tier, 'free'> }
  | { status: 'cancelled' }
  | { status: 'unavailable'; message: string }
  | { status: 'entitlement_missing'; message: string };

// Judges use RevenueCat Test Store, so a simulated successful purchase must
// produce the same CustomerInfo entitlement the production app expects.
// Dismissing the paywall is deliberately not success: the judge is reviewing
// both the interface and the actual entitlement execution.
export async function presentPaywallAsJudge(
  tier: Exclude<Tier, 'free'>
): Promise<JudgePaywallOutcome> {
  const outcome = await presentPaywallForTier(tier);
  if (!outcome.shown) {
    return {
      status: 'unavailable',
      message:
        outcome.reason === 'not_configured'
          ? 'RevenueCat Test Store is not configured for this judge build.'
          : outcome.message,
    };
  }
  if (outcome.result === PAYWALL_RESULT.CANCELLED || outcome.result === PAYWALL_RESULT.NOT_PRESENTED) {
    return { status: 'cancelled' };
  }
  if (outcome.result === PAYWALL_RESULT.ERROR) {
    return { status: 'unavailable', message: 'RevenueCat could not complete the test purchase. Please try again.' };
  }
  if (!outcome.tier || outcome.tier === 'free' || !tierSatisfies(outcome.tier, tier)) {
    return {
      status: 'entitlement_missing',
      message: `The test purchase finished, but RevenueCat did not return the ${tier === 'pro' ? 'Pro' : 'Max'} entitlement.`,
    };
  }
  return { status: 'activated', tier: outcome.tier };
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
