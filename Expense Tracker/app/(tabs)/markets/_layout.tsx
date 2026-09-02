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
    </Stack>
  );
}
