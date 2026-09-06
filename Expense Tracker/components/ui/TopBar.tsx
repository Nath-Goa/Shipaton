import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TierBadge } from '@/components/ui/TierBadge';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function TopBar({ title, subtitle, right }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.titleWrap}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <TierBadge />
        </View>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.text3 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.actions}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  titleWrap: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 27, fontWeight: '800', letterSpacing: -0.7, flexShrink: 1 },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
