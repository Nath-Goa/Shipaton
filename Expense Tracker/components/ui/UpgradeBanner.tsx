import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { spacing } from '@/constants/theme';
import { useAiQuota } from '@/hooks/useAiQuota';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { useSettingsStore } from '@/store/useSettingsStore';

import { Card } from './Card';

type Props = {
  title: string;
  body: string;
};

// Free-tier-only upgrade nudge, shown consistently across every main tab
// (Home has its own inline version predating this component; Markets,
// Portfolio, Expenses, Learn, and Assistant all use this one) — each
// passes copy relevant to what that screen actually gates behind Pro/Max.
export function UpgradeBanner({ title, body }: Props) {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();
  const { remaining } = useAiQuota();

  if (tier !== 'free') return null;

  return (
    <View>
      <Pressable feedbackCategory="primary" onPress={() => upgradeToTier('pro')}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  upsell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  title: { fontSize: 14.5, fontWeight: '700' },
  body: { fontSize: 12.5, marginTop: 2 },
});
