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
import { fetchTierPrice, isPurchasesConfigured, restorePurchases } from '@/services/purchases/revenuecat';
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
    if (!configured) return;
    let alive = true;
    Promise.all([fetchTierPrice('pro'), fetchTierPrice('max')]).then(([pro, max]) => {
      if (!alive) return;
      setLivePrice({ ...(pro ? { pro } : {}), ...(max ? { max } : {}) });
    });
    return () => {
      alive = false;
    };
  }, [configured]);

  function priceLabel(t: Tier): string {
    if (t === 'free') return TIER_PRICE.free;
    // TEMPORARY (constants/judgeMode.ts) — showing a judge a price they will
    // never be asked for would just be confusing.
    if (isJudge) return 'Free while judging';
    if (!configured) return `From ${TIER_PRICE[t]}`;
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
          showToast(`You're now on ${TIER_LABELS[outcome.tier]}.`);
          router.back();
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
  // paywall first — judges are here to evaluate that integration, so it has
  // to be visible — and the tier is granted however they leave it, charged
  // or not. Downgrading to Free needs no paywall at all.
  async function chooseAsJudge(next: Tier) {
    if (next === 'free') {
      setTier('free');
      showToast("You're now on Free.");
      router.back();
      return;
    }
    setBusyTier(next);
    const granted = await presentPaywallAsJudge(next);
    setBusyTier(null);
    setTier(granted.tier);
    showToast(
      granted.viaRevenueCat
        ? `${TIER_LABELS[granted.tier]} active via RevenueCat.`
        : `${TIER_LABELS[granted.tier]} unlocked — free while judging.`
    );
    router.back();
  }

  function chooseDemo(next: Tier) {
    setTier(next);
    showToast(`You're now on ${TIER_LABELS[next]}. (Demo mode — no charge.)`);
    router.back();
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
              ? 'Judging mode — tapping a plan opens the real RevenueCat paywall so you can review it. Close it without subscribing and the plan unlocks free; no card is needed.'
              : configured
                ? 'Purchases are processed by the App Store / Google Play, at the price shown for your region. Billing periods and any intro offers are on the next screen.'
                : 'Demo mode — RevenueCat has no API key configured yet, so switching plans here is local to this device and doesn’t charge anything. See .env.example.'}
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
                    They sit ahead of the `configured` checks so a judge gets
                    the same one-tap unlock whether or not RevenueCat has live
                    keys. */}
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
                    label={`Open ${TIER_LABELS[t]} paywall — free`}
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
                ) : (
                  <Button label={`Choose ${TIER_LABELS[t]} (Demo)`} fullWidth onPress={() => chooseDemo(t)} />
                )}
              </Card>
            </Animated.View>
          );
        })}

        {configured ? (
          <Animated.View entering={FadeInDown.delay(60 + TIERS.length * 60).springify().damping(16)}>
            <Button label="Restore purchases" variant="ghost" fullWidth loading={restoring} onPress={handleRestore} />
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
  card: { gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontSize: 18, fontWeight: '700' },
  price: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  headline: { fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  features: { gap: 6, marginBottom: spacing.lg },
  feature: { fontSize: 13 },
});
