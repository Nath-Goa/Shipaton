import { StyleSheet, Text, View } from 'react-native';

import { radius, shadow, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  label: string;
  value: string;
  sub?: string;
  dotColor?: string;
  valueColor?: string;
};

export function StatTile({ label, value, sub, dotColor, valueColor }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.sm]}>
      <Text style={[styles.label, { color: colors.text3 }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: valueColor ?? colors.text }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <View style={styles.subRow}>
          {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
          <Text style={[styles.sub, { color: colors.text3 }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: '47%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  label: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  value: {
    marginTop: spacing.sm,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  sub: {
    fontSize: 12.5,
  },
});
