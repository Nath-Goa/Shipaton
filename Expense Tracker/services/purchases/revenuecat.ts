import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  PACKAGE_TYPE,
  LOG_LEVEL,
} from 'react-native-purchases';

import { APP_VARIANT } from '@/constants/build';
import { ENTITLEMENT_APP, ENTITLEMENT_MAX, ENTITLEMENT_PRO, type Tier } from '@/constants/subscription';

// RevenueCat is the sole source of truth for entitlement state in this app.
// Get your API keys from the RevenueCat dashboard (Project settings > API
// keys) and set them as build-time env vars — see .env.example. These are
// public SDK keys (not secrets), safe to ship in the client bundle, but
// they're still env-driven rather than hardcoded so the same code works
// across dev/staging/production RevenueCat projects.
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
const TEST_STORE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY;
// Fallback for projects that have not split iOS/Android keys yet. The
// RevenueCat public SDK key is safe to ship; Judge builds still exclusively
// use TEST_STORE_API_KEY.
const SHARED_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

let configured = false;

export type PurchasesEnvironment = 'test_store' | 'production' | 'development' | 'demo';

export function getPurchasesEnvironment(): PurchasesEnvironment {
  if (APP_VARIANT === 'judge') return TEST_STORE_API_KEY ? 'test_store' : 'demo';
  if (APP_VARIANT === 'production') return apiKeyForPlatform() ? 'production' : 'demo';
  return apiKeyForPlatform() ? 'development' : 'demo';
}

function apiKeyForPlatform(): string | undefined {
  if (APP_VARIANT === 'judge') return TEST_STORE_API_KEY;
  if (Platform.OS === 'ios') return IOS_API_KEY ?? SHARED_API_KEY;
  if (Platform.OS === 'android') return ANDROID_API_KEY ?? SHARED_API_KEY;
  return undefined; // RevenueCat's native SDK has no web target.
}

// Native-only, and a no-op if no key is configured for this platform yet —
// call it once at app start regardless of environment, it's always safe.
export function configurePurchases(): boolean {
  if (configured) return true;
  const apiKey = apiKeyForPlatform();
  if (!apiKey) return false;
  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
  } catch {
    // configure() throws synchronously on a malformed key (a truncated
    // paste, a secret key used in place of a public SDK key). This is
    // called from a useEffect in app/_layout.tsx, so an uncaught throw here
    // takes the whole app down at launch instead of quietly falling back to
    // demo mode. Staying unconfigured is the correct outcome either way.
    return false;
  }
  configured = true;
  return true;
}

export function isPurchasesConfigured(): boolean {
  return configured;
}

// A customer holding the Max entitlement is treated as Max regardless of
// whether they also hold Pro — configure the Max product in RevenueCat to
// grant both entitlements (or just Max) depending on how you want Pro
// subscribers who upgrade to be modeled. ENTITLEMENT_APP is an alternate
// signal for the same base tier as ENTITLEMENT_PRO — see its definition in
// constants/subscription.ts.
export function tierFromCustomerInfo(info: CustomerInfo): Tier {
  const active = info.entitlements.active;
  if (active[ENTITLEMENT_MAX]) return 'max';
  if (active[ENTITLEMENT_PRO] || active[ENTITLEMENT_APP]) return 'pro';
  return 'free';
}

// Each paid tier has its own Offering in the RevenueCat dashboard
// (identifier "pro" / "max"), each containing monthly / annual / lifetime
// packages — this is what backs the per-tier paywall in
// app/settings/upgrade.tsx. Never fall back to an unrelated current
// offering: that can show Pro products when the user tapped Max (and make
// both comparison cards report the same price).
export async function fetchOfferingForTier(tier: Exclude<Tier, 'free'>): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.all[tier] ?? null;
  } catch {
    return null;
  }
}

// The store-localized "from" price for a tier, e.g. "$4.99/mo" — read off
// the tier's own Offering so the plan-comparison screen shows what the user
// will actually be charged in their region and currency, rather than the
// hardcoded demo figures in constants/subscription.ts. Monthly is the
// anchor because that's what the card reads as ("From X"); annual and then
// whatever else the offering has are the fallbacks if there's no monthly
// package. Returns null when RevenueCat can't tell us — the caller decides
// what to show instead, and must never silently substitute a demo price.
export async function fetchTierPrice(tier: Exclude<Tier, 'free'>): Promise<string | null> {
  const offering = await fetchOfferingForTier(tier);
  if (!offering) return null;
  const pkg = offering.monthly ?? offering.annual ?? offering.availablePackages[0];
  const priceString = pkg?.product?.priceString;
  return priceString ? `${priceString}${periodSuffix(pkg)}` : null;
}

function periodSuffix(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.WEEKLY:
      return '/wk';
    case PACKAGE_TYPE.MONTHLY:
      return '/mo';
    case PACKAGE_TYPE.ANNUAL:
      return '/yr';
    default:
      // Lifetime and the odd multi-month packages read fine bare — a price
      // with no period is unambiguous, an invented one wouldn't be.
      return '';
  }
}

// Whether a customer already on `current` has everything `required` unlocks.
// Max covers Pro; nothing covers Max but Max. Used to decide whether a
// paywall needs showing at all — see presentPaywallIfNeededForTier.
export function tierSatisfies(current: Tier, required: Exclude<Tier, 'free'>): boolean {
  if (required === 'pro') return current === 'pro' || current === 'max';
  return current === 'max';
}

export async function restorePurchases(): Promise<
  { ok: true; tier: Tier } | { ok: false; message: string }
> {
  if (!configured) {
    // Every other entry point guards on this; without it the native SDK
    // throws its own "singleton instance not configured" text, which would
    // surface verbatim in a toast.
    return { ok: false, message: 'Restoring purchases is not available in demo mode.' };
  }
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, tier: tierFromCustomerInfo(customerInfo) };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Could not restore purchases.' };
  }
}

export async function fetchCurrentTier(): Promise<Tier | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return tierFromCustomerInfo(info);
  } catch {
    return null;
  }
}

// The date the customer's current paid entitlement first started (survives
// renewals — this is the original purchase, not the latest one). Returns
// null for Free (no active entitlement) or when RevenueCat isn't configured
// (demo mode has no real subscription to date).
export async function fetchSubscriptionSince(): Promise<Date | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    const active = info.entitlements.active;
    const entitlement = active[ENTITLEMENT_MAX] ?? active[ENTITLEMENT_PRO] ?? active[ENTITLEMENT_APP];
    return entitlement ? new Date(entitlement.originalPurchaseDate) : null;
  } catch {
    return null;
  }
}

// Fires on every entitlement change — purchase, renewal, expiration,
// restore, or a refund processed server-side. Returns an unsubscribe fn.
export function subscribeTierChanges(onTier: (tier: Tier) => void): () => void {
  if (!configured) return () => {};
  const listener = (info: CustomerInfo) => onTier(tierFromCustomerInfo(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
