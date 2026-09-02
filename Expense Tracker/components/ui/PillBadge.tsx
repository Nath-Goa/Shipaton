import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  label: string;
  color?: string;
  backgroundColor?: string;
};

export function PillBadge({ label, color, backgroundColor }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: backgroundColor ?? colors.accentSoft }]}>
      <Text style={[styles.label, { color: color ?? colors.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
