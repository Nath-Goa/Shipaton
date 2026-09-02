import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';

const TIERS: Tier[] = ['basic', 'pro', 'max'];

export default function UpgradeScreen() {
  const { colors } = useTheme();
  const { tier, setTier } = useSettingsStore();
  const showToast = useToastStore((s) => s.show);

  function choose(next: Tier) {
    setTier(next);
    showToast(`You're now on ${TIER_LABELS[next]}.`);
    router.back();
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.text3 }]}>
          Demo mode — switching plans here is local to this device and doesn&apos;t charge anything.
        </Text>

        {TIERS.map((t) => {
          const isCurrent = tier === t;
          return (
            <Card key={t} style={[styles.card, isCurrent && { borderColor: colors.accent, borderWidth: 1.5 }]}>
              <View style={styles.headRow}>
                <Text style={[styles.tierName, { color: colors.text }]}>{TIER_LABELS[t]}</Text>
                {isCurrent ? <PillBadge label="Current" /> : null}
              </View>
              <Text style={[styles.price, { color: colors.text }]}>{TIER_PRICE[t]}</Text>
              <Text style={[styles.headline, { color: colors.text2 }]}>{TIER_HEADLINE[t]}</Text>

              <View style={styles.features}>
                {TIER_FEATURE_COPY[t].map((f) => (
                  <Text key={f} style={[styles.feature, { color: colors.text2 }]}>
                    ✓ {f}
                  </Text>
                ))}
              </View>

              <Button
                label={isCurrent ? 'Current plan' : `Choose ${TIER_LABELS[t]}`}
                variant={isCurrent ? 'ghost' : t === 'basic' ? 'ghost' : 'primary'}
                disabled={isCurrent}
                fullWidth
                onPress={() => choose(t)}
              />
            </Card>
          );
        })}
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
