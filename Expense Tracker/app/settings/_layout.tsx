import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

export default function SettingsLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      {/* Settings renders its own top bar (app/settings/index.tsx) instead of
          the native header: the hidden 9-tap tier switcher has to be hittable
          anywhere along the bar, and a native header only exposes its title
          component to touch. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="upgrade" options={{ presentation: 'modal', title: 'Choose your plan' }} />
      <Stack.Screen name="achievements" options={{ presentation: 'modal', title: 'Achievements' }} />
      <Stack.Screen name="records" options={{ presentation: 'modal', title: 'Personal Records' }} />
      <Stack.Screen name="quality-of-life" options={{ title: 'Quality of Life' }} />
      <Stack.Screen name="debug" options={{ title: 'Debug Menu' }} />
    </Stack>
  );
}
