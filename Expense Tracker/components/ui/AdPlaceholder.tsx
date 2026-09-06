import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';

// No third-party ad network is wired up — this is an in-house placeholder
// that stands in for the "every 3rd lookup" ad slot on Free, styled like a
// real ad unit but honestly self-promotional rather than pretending to
// serve third-party ad content. Free is the only tier this renders for
// (see adsEnabled in constants/subscription.ts).
export function AdPlaceholder() {
  const { colors } = useTheme();
  const upgradeToTier = useUpgradeToTier();
  return (
    <Pressable
      feedbackCategory="primary"
      onPress={() => upgradeToTier('pro')}
      style={[styles.wrap, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>SPONSORED</Text>
        <Ionicons name="sparkles-outline" size={13} color={colors.text3} />
      </View>
      <Text style={[styles.body, { color: colors.text2 }]}>Go ad-free and unlock live sentiment with Pro.</Text>
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
  body: { fontSize: 12.5 },
});
