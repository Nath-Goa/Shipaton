import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useAiQuota } from '@/hooks/useAiQuota';
import { useTabEntrance } from '@/hooks/useTabEntrance';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { useSettingsStore } from '@/store/useSettingsStore';

import { Card } from './Card';

type Props = {
  title: string;
  body: string;
  delay?: number;
};

// Free-tier-only upgrade nudge, shown consistently across every main tab
// (Home has its own inline version predating this component; Markets,
// Portfolio, Expenses, Learn, and Assistant all use this one) — each
// passes copy relevant to what that screen actually gates behind Pro/Max.
export function UpgradeBanner({ title, body, delay = 0 }: Props) {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();
  const { remaining } = useAiQuota();
  const entranceStyle = useTabEntrance(delay);

  if (tier !== 'free') return null;

  return (
    <Animated.View style={entranceStyle}>
      <Pressable onPress={() => upgradeToTier('pro')}>
        <Card style={[styles.upsell, { borderColor: colors.accent }]}>
          <Ionicons name="sparkles" size={18} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.body, { color: colors.text3 }]}>
              {body}
              {remaining === 0 ? ' 0 free actions remaining today.' : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.text3} />
        </Card>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  upsell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  title: { fontSize: 14.5, fontWeight: '700' },
  body: { fontSize: 12.5, marginTop: 2 },
});
