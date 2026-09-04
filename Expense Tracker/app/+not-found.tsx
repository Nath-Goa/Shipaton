import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen>
        <View style={styles.container}>
          <Text style={[styles.title, { color: colors.text }]}>This screen doesn&apos;t exist.</Text>
          <Link href="/" style={styles.link}>
            <Text style={[styles.linkText, { color: colors.accent }]}>Go to Home</Text>
          </Link>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 16, fontWeight: '700' },
  link: { paddingVertical: spacing.md },
  linkText: { fontSize: 14, fontWeight: '700' },
});
