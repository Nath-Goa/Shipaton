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
    </Stack>
  );
}
