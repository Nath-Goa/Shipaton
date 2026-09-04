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
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="upgrade" options={{ presentation: 'modal', title: 'Choose your plan' }} />
      <Stack.Screen name="achievements" options={{ presentation: 'modal', title: 'Achievements' }} />
      <Stack.Screen name="records" options={{ presentation: 'modal', title: 'Personal Records' }} />
    </Stack>
  );
}
