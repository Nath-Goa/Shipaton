import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

export default function MarketsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[symbol]" />
      <Stack.Screen name="practice" options={{ presentation: 'modal', title: 'Practice Trade' }} />
      <Stack.Screen name="backtest" options={{ title: 'Backtest' }} />
      {/* Portfolio nests here as its own Stack (app/(tabs)/markets/portfolio/_layout.tsx)
          rather than as a sibling bottom tab — Markets and Portfolio are two views of
          the same trading domain, and folding one bottom-tab slot into the other was
          the fix for too many tabs cluttering the bar. headerShown: false lets that
          nested Stack's own header show instead of stacking two. */}
      <Stack.Screen name="portfolio" options={{ headerShown: false }} />
    </Stack>
  );
}
