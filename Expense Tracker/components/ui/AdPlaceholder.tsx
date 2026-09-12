import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';

// No ad network is wired up anywhere in the app. This is an in-house upgrade
// nudge shown in the Free-tier "every 3rd lookup" slot on the stock detail
// screen — it promotes this app's own Pro subscription only, and is not
// third-party advertising or cross-promotion of other products. Free is the
// only tier this renders for (see adsEnabled in constants/subscription.ts).
export function AdPlaceholder() {
  const { colors } = useTheme();
  const upgradeToTier = useUpgradeToTier();
  return (
    <Pressable
      feedbackCategory="primary"
      onPress={() => upgradeToTier('pro')}
      style={[styles.wrap, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>PRO</Text>
        <Ionicons name="sparkles-outline" size={13} color={colors.text3} />
      </View>
      <Text style={[styles.body, { color: colors.text2 }]}>Unlock live sentiment and full forecasts with Pro.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  body: { fontSize: 12.5, letterSpacing: trackingFor(12.5) },
});
