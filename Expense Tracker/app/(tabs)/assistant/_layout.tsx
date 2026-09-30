import { Stack } from 'expo-router';

// Keeps this stack's root under any screen reached from outside the tab
// (a purchase perk, a cross-tab link). Without it, navigating straight to
// a nested screen made it the only route, stranding it with no way back.
export const unstable_settings = { anchor: 'index' };

export default function AssistantLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
