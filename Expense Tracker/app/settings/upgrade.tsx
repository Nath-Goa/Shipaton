import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import {
  TIER_FEATURE_COPY,
  TIER_HEADLINE,
  TIER_LABELS,
  TIER_PRICE,
  type Tier,
} from '@/constants/subscription';
import { useAgePermissions, useIsJudgeMode } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import {
  PAYWALL_RESULT,
  presentCustomerCenter,
  presentPaywallAsJudge,
  presentPaywallForTier,
} from '@/services/purchases/paywallUI';
import { showPlanChangeScreen } from '@/services/purchases/planChangeScreens';
import {
  fetchTierPrice,
  getPurchasesEnvironment,
  isPurchasesConfigured,
  restorePurchases,
  tierSatisfies,
} from '@/services/purchases/revenuecat';
import { useAgeStore } from '@/store/useAgeStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';

const TIERS: Tier[] = ['free', 'pro', 'max'];

export default function UpgradeScreen() {
  const { colors } = useTheme();
  const { tier, setTier } = useSettingsStore();
  const showToast = useToastStore((s) => s.show);
  const agePermissions = useAgePermissions();
  const isJudge = useIsJudgeMode();
  const configured = isPurchasesConfigured();
  const purchasesEnvironment = getPurchasesEnvironment();
  const judgeAccessSource = useAgeStore((s) => s.judgeAccessSource);
  const judgeAccessTier = useAgeStore((s) => s.judgeAccessTier);
  const judgeOfflineFallbackAvailable = useAgeStore((s) => s.judgeOfflineFallbackAvailable);
  const grantJudgeAccess = useAgeStore((s) => s.grantJudgeAccess);
  const offerJudgeOfflineFallback = useAgeStore((s) => s.offerJudgeOfflineFallback);
  const chooseJudgeFree = useAgeStore((s) => s.chooseJudgeFree);

  const [busyTier, setBusyTier] = useState<Tier | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [openingCenter, setOpeningCenter] = useState(false);
  // Real, store-localized prices, once RevenueCat has told us what they are.
  // TIER_PRICE's figures are demo pricing and can be flatly wrong against a
  // live dashboard or in another currency, so they're only ever shown when
  // there's no RevenueCat to ask — never as a placeholder next to copy
  // promising App Store / Play billing.
  const [livePrice, setLivePrice] = useState<Partial<Record<Exclude<Tier, 'free'>, string>>>({});

  useEffect(() => {
    if (!configured || isJudge) return;
    let alive = true;
    Promise.all([fetchTierPrice('pro'), fetchTierPrice('max')]).then(([pro, max]) => {
      if (!alive) return;
      setLivePrice({ ...(pro ? { pro } : {}), ...(max ? { max } : {}) });
    });
    return () => {
      alive = false;
    };
  }, [configured, isJudge]);

  function priceLabel(t: Tier): string {
    if (t === 'free') return TIER_PRICE.free;
    // TEMPORARY (constants/judgeMode.ts). Judges see the regular prices here
    // so the plan screen reads exactly as it does for a paying user; the
    // Test Store products behind the RevenueCat paywall are priced at $0, so
    // RevenueCat's own sheet is where the free checkout shows. Never the live
    // Test Store price here — that would just print $0.00 on every card.
    if (isJudge || !configured) return `From ${TIER_PRICE[t]}`;
    const live = livePrice[t];
    return live ? `From ${live}` : 'See pricing →';
  }

  // Opens RevenueCat's own Paywall UI for this tier's Offering (its
  // "monthly" / "yearly" / "lifetime" packages) — pricing, layout, and the
  // whole purchase flow are handled natively from there.
  async function handleChoose(t: Exclude<Tier, 'free'>) {
    // TEMPORARY, hackathon judging only (constants/judgeMode.ts). This
    // screen is reachable directly from Settings, not only via
    // useUpgradeToTier, so the grant is repeated here rather than assumed.
    if (isJudge) {
      chooseAsJudge(t);
      return;
    }
    const from = tier;
    setBusyTier(t);
    const outcome = await presentPaywallForTier(t);
    setBusyTier(null);

    if (!outcome.shown) {
      showToast(
        outcome.reason === 'not_configured'
          ? 'Demo mode — set up RevenueCat to enable real purchases. See .env.example.'
          : outcome.message
      );
      return;
    }
    switch (outcome.result) {
      case PAYWALL_RESULT.PURCHASED:
        if (outcome.tier && outcome.tier !== 'free') {
          setTier(outcome.tier);
          if (announcePlanChange(from, outcome.tier)) return;
          // The plan didn't move. A store can keep a higher plan active
          // after a lower one is bought, so say that rather than celebrate.
          showToast(
            outcome.tier !== t && tierSatisfies(outcome.tier, t)
              ? `Purchase complete. Your ${TIER_LABELS[outcome.tier]} access is still active, so you stay on ${TIER_LABELS[outcome.tier]} for now.`
              : `You're on ${TIER_LABELS[outcome.tier]}.`
          );
        } else {
          showToast('Purchase completed, but access is still syncing. Try Restore purchases in a moment.');
        }
        return;
      case PAYWALL_RESULT.RESTORED:
        if (outcome.tier) setTier(outcome.tier);
        showToast(
          outcome.tier && outcome.tier !== 'free' ? `Restored — you're on ${TIER_LABELS[outcome.tier]}.` : 'No active purchases found to restore.'
        );
        return;
      case PAYWALL_RESULT.ERROR:
        showToast('Something went wrong opening the paywall. Try again.');
        return;
      case PAYWALL_RESULT.CANCELLED:
      case PAYWALL_RESULT.NOT_PRESENTED:
      default:
        return;
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    if (isJudge && result.tier === 'free' && judgeAccessTier) {
      setTier(judgeAccessTier);
      showToast('No active Test Store purchase found. Your completed judge preview remains available.');
      return;
    }
    if (isJudge && result.tier !== 'free') grantJudgeAccess(result.tier, 'test_store');
    setTier(result.tier);
    showToast(
      result.tier === 'free' ? 'No active purchases found to restore.' : `Restored — you're on ${TIER_LABELS[result.tier]}.`
    );
  }

  // RevenueCat's Customer Center: self-serve cancel/change-plan/refund UI,
  // configured in the dashboard. Falls back to nothing useful in demo mode,
  // so that path isn't offered there at all.
  async function handleManage() {
    setOpeningCenter(true);
    const result = await presentCustomerCenter();
    setOpeningCenter(false);
    if (!result.ok) showToast(result.message ?? 'Could not open subscription management.');
  }

  // TEMPORARY (constants/judgeMode.ts). Paid tiers open the real RevenueCat
  // paywall first, then requires RevenueCat Test Store's simulated purchase
  // to return the expected entitlement. Downgrading to Free needs no paywall.
  async function chooseAsJudge(next: Tier) {
    const from = tier;
    if (next === 'free') {
      // Remembered, not just cleared: the Test Store purchase is still
      // active in RevenueCat, and the tier listener would otherwise put
      // the judge straight back on it.
      chooseJudgeFree();
      setTier('free');
      if (!announcePlanChange(from, 'free')) {
        showToast("You're now on Free.");
        router.back();
      }
      return;
    }
    setBusyTier(next);
    const outcome = await presentPaywallAsJudge(next);
    setBusyTier(null);
    if (outcome.status === 'activated') {
      grantJudgeAccess(outcome.tier, 'test_store');
      setTier(outcome.tier);
      if (!announcePlanChange(from, outcome.tier)) {
        showToast(`You're on ${TIER_LABELS[outcome.tier]}.`);
        router.back();
      }
      return;
    }
    if (outcome.status === 'cancelled') {
      showToast('Test purchase cancelled — your plan was not changed.');
      return;
    }
    offerJudgeOfflineFallback();
    showToast(outcome.message);
  }

  function activateOfflineJudgePreview() {
    grantJudgeAccess('max', 'offline_preview');
    setTier('max');
    showToast('Offline Max preview unlocked. RevenueCat was not used for this fallback.');
    router.back();
  }

  function chooseDemo(next: Tier) {
    const from = tier;
    setTier(next);
    if (announcePlanChange(from, next)) return;
    showToast(`You're now on ${TIER_LABELS[next]}. (Demo mode — no charge.)`);
    router.back();
  }

  // Closes this plan screen first, so backing out of the celebration (or
  // the goodbye) lands on whatever opened it rather than on a plan list
  // that's now stale. False when the plan didn't actually change.
  function announcePlanChange(from: Tier, to: Tier): boolean {
    if (from === to) return false;
    router.back();
    showPlanChangeScreen(from, to);
    return true;
  }

  // This screen is reachable directly from Settings, not only through
  // useUpgradeToTier, so it needs the same rule applied independently. No
  // prices are shown either — a plan list a minor cannot buy is just an
  // advert aimed at them.
  if (!agePermissions.purchases) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState
          icon="🔒"
          title="Subscriptions are 18+"
          message="Markva does not sell subscriptions to under-18 accounts. Everything on the free plan stays available, including unlimited paper trading, all lessons and quizzes, budgets and savings goals."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.intro, { color: colors.text3 }]}>
            {isJudge
              ? purchasesEnvironment === 'test_store'
                ? 'Judging mode — pick a plan and buy it through the RevenueCat paywall, then tap “Test valid purchase”. It runs through RevenueCat Test Store, so no card is needed and nothing is charged.'
                : 'Judging mode is active, but this APK has no RevenueCat Test Store key. Try a plan to reveal the clearly labeled offline preview fallback.'
              : configured
                ? 'Purchases are processed by the App Store / Google Play, at the price shown for your region. Billing periods and any intro offers are on the next screen.'
                : __DEV__
                  ? 'Demo mode — RevenueCat has no API key configured yet, so switching plans here is local to this device and doesn’t charge anything. See .env.example.'
                  : 'Subscriptions aren’t available yet on this build. Check back soon.'}
          </Text>
        </Animated.View>

        {TIERS.map((t, i) => {
          const isCurrent = tier === t;

          return (
            <Animated.View key={t} entering={FadeInDown.delay(60 + i * 60).springify().damping(16)}>
              <Card style={[styles.card, isCurrent && { borderColor: colors.accent, borderWidth: 1.5 }]}>
                <View style={styles.headRow}>
                  <Text style={[styles.tierName, { color: colors.text }]}>{TIER_LABELS[t]}</Text>
                  {isCurrent ? <PillBadge label="Current" /> : null}
                </View>
                <Text style={[styles.price, { color: colors.text }]}>{priceLabel(t)}</Text>
                <Text style={[styles.headline, { color: colors.text2 }]}>{TIER_HEADLINE[t]}</Text>

                <View style={styles.features}>
                  {TIER_FEATURE_COPY[t].map((f) => (
                    <Text key={f} style={[styles.feature, { color: colors.text2 }]}>
                      ✓ {f}
                    </Text>
                  ))}
                </View>

                {/* The judge branches are TEMPORARY — constants/judgeMode.ts.
                    They require a Test Store entitlement; a failure reveals
                    the separate, clearly labeled offline fallback below. */}
                {t === 'free' ? (
                  isCurrent ? (
                    <Button label="Current plan" variant="ghost" disabled fullWidth />
                  ) : isJudge ? (
                    <Button label="Switch to Free" variant="ghost" fullWidth onPress={() => chooseAsJudge(t)} />
                  ) : configured ? (
                    <Button label="Manage subscription" variant="ghost" loading={openingCenter} fullWidth onPress={handleManage} />
                  ) : (
                    <Button label="Choose Free" variant="ghost" fullWidth onPress={() => chooseDemo(t)} />
                  )
                ) : isCurrent ? (
                  <Button label="Current plan" variant="ghost" disabled fullWidth />
                ) : isJudge ? (
                  <Button
                    label={`View ${TIER_LABELS[t]} plan`}
                    loading={busyTier === t}
                    fullWidth
                    onPress={() => chooseAsJudge(t)}
                  />
                ) : configured ? (
                  <Button
                    label={`View ${TIER_LABELS[t]} plan`}
                    loading={busyTier === t}
                    fullWidth
                    onPress={() => handleChoose(t)}
                  />
                ) : __DEV__ ? (
                  // __DEV__-gated: without a RevenueCat key, this button
                  // used to grant a paid tier for free to anyone on any
                  // build, not only in development — the real free-upgrade
                  // hole this whole screen exists to avoid. A production
                  // build with no key configured yet now shows the same
                  // "not available" state as a real paywall failure.
                  <Button label={`Choose ${TIER_LABELS[t]} (Demo)`} fullWidth onPress={() => chooseDemo(t)} />
                ) : (
                  <Button label="Not available yet" variant="ghost" disabled fullWidth />
                )}
              </Card>
            </Animated.View>
          );
        })}

        {configured ? (
          <Animated.View entering={FadeInDown.delay(60 + TIERS.length * 60).springify().damping(16)}>
            <Button
              label={isJudge ? 'Restore Test Store purchase' : 'Restore purchases'}
              variant="ghost"
              fullWidth
              loading={restoring}
              onPress={handleRestore}
            />
          </Animated.View>
        ) : null}

        {isJudge && judgeOfflineFallbackAvailable ? (
          <Card style={styles.fallbackCard}>
            <Text style={[styles.tierName, { color: colors.text }]}>RevenueCat unavailable?</Text>
            <Text style={[styles.headline, { color: colors.text2 }]}>
              Retry the Test Store first. If the network or dashboard setup is unavailable during judging, you can
              still inspect every Max feature locally. This fallback does not count as a RevenueCat purchase.
            </Text>
            <Button label="Retry RevenueCat Test Store" fullWidth onPress={() => chooseAsJudge('max')} />
            <Button label="Continue with offline Max preview" variant="ghost" fullWidth onPress={activateOfflineJudgePreview} />
          </Card>
        ) : null}

        {isJudge && judgeAccessSource ? (
          <Text style={[styles.accessSource, { color: colors.text3 }]}>
            Access source: {judgeAccessSource === 'test_store' ? 'RevenueCat Test Store' : 'local offline preview'}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 12, letterSpacing: trackingFor(12), textAlign: 'center', lineHeight: 16 },
  card: { gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontSize: 18, letterSpacing: trackingFor(18), fontWeight: '700' },
  price: { fontSize: 22, letterSpacing: trackingFor(22), fontWeight: '700', marginTop: 2 },
  headline: { fontSize: 13, letterSpacing: trackingFor(13), marginTop: 4, marginBottom: spacing.md },
  features: { gap: 6, marginBottom: spacing.lg },
  feature: { fontSize: 13, letterSpacing: trackingFor(13) },
  fallbackCard: { gap: spacing.sm },
  accessSource: { fontSize: 12, letterSpacing: trackingFor(12), textAlign: 'center' },
});
