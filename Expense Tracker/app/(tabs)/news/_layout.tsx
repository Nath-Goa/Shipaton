import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

// Keeps this stack's root under any screen reached from outside the tab
// (a purchase perk, a cross-tab link). Without it, navigating straight to
// a nested screen made it the only route, stranding it with no way back.
export const unstable_settings = { anchor: 'index' };

export default function NewsLayout() {
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
    </Stack>
  );
}
