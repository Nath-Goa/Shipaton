import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

// Keeps this stack's root under any screen reached from outside the tab
// (a purchase perk, a cross-tab link). Without it, navigating straight to
// a nested screen made it the only route, stranding it with no way back.
export const unstable_settings = { anchor: 'index' };

export default function LearnLayout() {
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
      <Stack.Screen name="quiz" options={{ presentation: 'modal', title: 'Quiz' }} />
      <Stack.Screen name="flashcards" options={{ title: 'Flashcards' }} />
      <Stack.Screen name="narrative" options={{ presentation: 'modal', title: 'Daily Challenge' }} />
      <Stack.Screen name="trivia" options={{ presentation: 'modal', title: 'Trivia Battle' }} />
      <Stack.Screen name="focus-session" options={{ presentation: 'modal', title: 'Focus Session' }} />
      <Stack.Screen name="level-select" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="course/[courseId]/index" options={{ title: 'Course' }} />
      <Stack.Screen name="course/[courseId]/lesson" options={{ title: 'Lesson' }} />
      <Stack.Screen name="course/[courseId]/practice" options={{ title: 'Practice' }} />
    </Stack>
  );
}
