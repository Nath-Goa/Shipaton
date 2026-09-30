import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

// Keeps this stack's root under any screen reached from outside the tab
// (a purchase perk, a cross-tab link). Without it, navigating straight to
// a nested screen made it the only route, stranding it with no way back.
export const unstable_settings = { anchor: 'index' };

export default function ExpensesLayout() {
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
      <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Add expense' }} />
      <Stack.Screen name="[id]" options={{ presentation: 'modal', title: 'Edit expense' }} />
      <Stack.Screen name="budgets" options={{ presentation: 'modal', title: 'Budgets' }} />
      <Stack.Screen name="goals" options={{ presentation: 'modal', title: 'Savings Goals' }} />
    </Stack>
  );
}
