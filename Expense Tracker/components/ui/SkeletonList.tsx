import { StyleSheet, View } from 'react-native';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <View accessibilityLabel="Loading content" style={styles.list}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: colors.surface2 }]} />
          <View style={styles.lines}>
            <View style={[styles.lineWide, { backgroundColor: colors.surface2 }]} />
            <View style={[styles.lineShort, { backgroundColor: colors.surface2 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 38, height: 38, borderRadius: radius.sm },
  lines: { flex: 1, gap: 7 },
  lineWide: { height: 11, width: '68%', borderRadius: 6 },
  lineShort: { height: 9, width: '42%', borderRadius: 5 },
});

