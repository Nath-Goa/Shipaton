import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  PURCHASES_ERROR_CODE,
  LOG_LEVEL,
} from 'react-native-purchases';

import { ENTITLEMENT_APP, ENTITLEMENT_MAX, ENTITLEMENT_PRO, type Tier } from '@/constants/subscription';

// RevenueCat is the sole source of truth for entitlement state in this app.
// Get your API keys from the RevenueCat dashboard (Project settings > API
// keys) and set them as build-time env vars — see .env.example. These are
// public SDK keys (not secrets), safe to ship in the client bundle, but
// they're still env-driven rather than hardcoded so the same code works
// across dev/staging/production RevenueCat projects.
const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
// A single key for projects that haven't split iOS/Android keys yet (e.g. a
// RevenueCat project with only one app configured so far). Platform-specific
// keys above always take priority when set.
const SHARED_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;

let configured = false;

function apiKeyForPlatform(): string | undefined {
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
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({ apiKey });
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

export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

// Each paid tier has its own Offering in the RevenueCat dashboard
// (identifier "pro" / "max"), each containing "monthly" / "yearly" /
// "lifetime" packages — this is what backs the per-tier paywall in
// app/settings/upgrade.tsx. Falls back to the "current" offering if a
// tier-named one hasn't been set up yet, so a fresh dashboard still shows
// something rather than nothing.
export async function fetchOfferingForTier(tier: Exclude<Tier, 'free'>): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.all[tier] ?? offerings.current;
}

export type PurchaseOutcome =
  | { ok: true; tier: Tier }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, tier: tierFromCustomerInfo(customerInfo) };
  } catch (e: any) {
    if (e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { ok: false, cancelled: true };
    }
    return { ok: false, cancelled: false, message: e?.message || 'Purchase failed. Try again.' };
  }
}

export async function restorePurchases(): Promise<
  { ok: true; tier: Tier } | { ok: false; message: string }
> {
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
