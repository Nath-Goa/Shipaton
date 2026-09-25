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
          the native header. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="upgrade" options={{ presentation: 'modal', title: 'Choose your plan' }} />
      <Stack.Screen name="achievements" options={{ presentation: 'modal', title: 'Achievements' }} />
      <Stack.Screen name="records" options={{ presentation: 'modal', title: 'Personal Records' }} />
      <Stack.Screen name="quality-of-life" options={{ title: 'Quality of Life' }} />
      <Stack.Screen name="debug" options={{ title: 'Debug Menu' }} />
    </Stack>
  );
}
