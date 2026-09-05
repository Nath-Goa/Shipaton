import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TIER_LABELS } from '@/constants/subscription';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/useSettingsStore';

// A small reminder of which paid tier is active, rendered next to a
// screen's title. Free renders nothing — there's nothing worth badging on
// the tier everyone starts on, and every upgrade surface already exists to
// sell the paid ones.
export function TierBadge() {
  const tier = useSettingsStore((s) => s.tier);
  const { colors } = useTheme();
  if (tier === 'free') return null;

  const color = tier === 'max' ? colors.warning : colors.accent;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Ionicons name="diamond" size={10} color={color} />
      <Text style={[styles.label, { color }]}>{TIER_LABELS[tier].toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1.25,
  },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
});
