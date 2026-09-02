import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { spacing } from '@/constants/theme';
import {
  TIER_FEATURE_COPY,
  TIER_HEADLINE,
  TIER_LABELS,
  TIER_PRICE,
  type Tier,
} from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchCurrentOffering,
  isPurchasesConfigured,
  purchasePackage,
  restorePurchases,
} from '@/services/purchases/revenuecat';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';

const TIERS: Tier[] = ['free', 'pro', 'max'];
const PAID_TIERS: Tier[] = ['pro', 'max'];

// The current RevenueCat Offering must contain a package per paid tier,
// identified by these exact package identifiers (Offering > Packages in the
// RevenueCat dashboard). That's how this screen knows which package maps to
// which app tier without hardcoding store product ids.
function packageFor(offering: PurchasesOffering | null, tier: Tier): PurchasesPackage | undefined {
  return offering?.availablePackages.find((p) => p.identifier === tier);
}

function manageSubscriptionUrl(): string {
  return Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
}

export default function UpgradeScreen() {
  const { colors } = useTheme();
  const { tier, setTier } = useSettingsStore();
  const showToast = useToastStore((s) => s.show);
  const configured = isPurchasesConfigured();

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(configured);
  const [purchasingTier, setPurchasingTier] = useState<Tier | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    setLoadingOffering(true);
    fetchCurrentOffering().then((result) => {
      if (!alive) return;
      setOffering(result);
      setLoadingOffering(false);
    });
    return () => {
      alive = false;
    };
  }, [configured]);

  async function handlePurchase(t: Tier, pkg: PurchasesPackage) {
    setPurchasingTier(t);
    const result = await purchasePackage(pkg);
    setPurchasingTier(null);
    if (result.ok) {
      setTier(result.tier);
      showToast(`You're now on ${TIER_LABELS[result.tier]}.`);
      router.back();
      return;
    }
    if (!result.cancelled) showToast(result.message);
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

  function chooseDemo(next: Tier) {
    setTier(next);
    showToast(`You're now on ${TIER_LABELS[next]}. (Demo mode — no charge.)`);
    router.back();
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.text3 }]}>
          {configured
            ? 'Manage your subscription — purchases are processed by the App Store / Google Play.'
            : 'Demo mode — RevenueCat has no API key configured yet, so switching plans here is local to this device and doesn’t charge anything. See .env.example.'}
        </Text>

        {configured && loadingOffering ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}

        {TIERS.map((t) => {
          const isCurrent = tier === t;
          const pkg = PAID_TIERS.includes(t) ? packageFor(offering, t) : undefined;
          const price = t === 'free' ? TIER_PRICE.free : pkg ? pkg.product.priceString : configured ? null : TIER_PRICE[t];

          return (
            <Card key={t} style={[styles.card, isCurrent && { borderColor: colors.accent, borderWidth: 1.5 }]}>
              <View style={styles.headRow}>
                <Text style={[styles.tierName, { color: colors.text }]}>{TIER_LABELS[t]}</Text>
                {isCurrent ? <PillBadge label="Current" /> : null}
              </View>
              <Text style={[styles.price, { color: colors.text }]}>{price ?? '—'}</Text>
              <Text style={[styles.headline, { color: colors.text2 }]}>{TIER_HEADLINE[t]}</Text>

              <View style={styles.features}>
                {TIER_FEATURE_COPY[t].map((f) => (
                  <Text key={f} style={[styles.feature, { color: colors.text2 }]}>
                    ✓ {f}
                  </Text>
                ))}
              </View>

              {t === 'free' ? (
                isCurrent ? (
                  <Button label="Current plan" variant="ghost" disabled fullWidth />
                ) : configured ? (
                  <Button label="Manage subscription" variant="ghost" fullWidth onPress={() => Linking.openURL(manageSubscriptionUrl()).catch(() => {})} />
                ) : (
                  <Button label="Choose Free" variant="ghost" fullWidth onPress={() => chooseDemo(t)} />
                )
              ) : isCurrent ? (
                <Button label="Current plan" variant="ghost" disabled fullWidth onPress={() => {}} />
              ) : configured ? (
                <Button
                  label={pkg ? `Subscribe — ${pkg.product.priceString}` : 'Not available yet'}
                  disabled={!pkg}
                  loading={purchasingTier === t}
                  fullWidth
                  onPress={() => pkg && handlePurchase(t, pkg)}
                />
              ) : (
                <Button label={`Choose ${TIER_LABELS[t]} (Demo)`} fullWidth onPress={() => chooseDemo(t)} />
              )}
            </Card>
          );
        })}

        {configured ? (
          <Button label="Restore purchases" variant="ghost" fullWidth loading={restoring} onPress={handleRestore} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
  loadingRow: { alignItems: 'center', paddingVertical: spacing.md },
  card: { gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontSize: 18, fontWeight: '700' },
  price: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  headline: { fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  features: { gap: 6, marginBottom: spacing.lg },
  feature: { fontSize: 13 },
});
