import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

export default function PortfolioLayout() {
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
      <Stack.Screen name="trade/[symbol]" options={{ presentation: 'modal', title: 'Trade' }} />
      <Stack.Screen name="manage" options={{ presentation: 'modal', title: 'Portfolios' }} />
      <Stack.Screen name="leaderboard" options={{ presentation: 'modal', title: 'Leaderboard' }} />
      <Stack.Screen name="social/index" options={{ headerShown: false }} />
      <Stack.Screen name="social/new-duel" options={{ presentation: 'modal', title: 'New duel' }} />
      <Stack.Screen name="social/duel/[id]" options={{ title: 'Duel' }} />
    </Stack>
  );
}
