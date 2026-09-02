import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// No real ad SDK is wired up (see constants/subscription.ts TODO) — this is
// a house placeholder that stands in for the "every 3rd lookup" ad slot on
// Basic, styled like a real ad unit but honestly self-promotional rather
// than pretending to serve third-party ad content.
export function AdPlaceholder() {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/settings/upgrade')}
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
