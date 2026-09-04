import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/useTheme';

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
      <Stack.Screen name="narrative" options={{ presentation: 'modal', title: 'Daily Challenge' }} />
      <Stack.Screen name="focus-session" options={{ presentation: 'modal', title: 'Focus Session' }} />
      <Stack.Screen name="level-select" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen name="course/[courseId]/index" options={{ title: 'Course' }} />
      <Stack.Screen name="course/[courseId]/lesson" options={{ title: 'Lesson' }} />
      <Stack.Screen name="course/[courseId]/practice" options={{ title: 'Practice' }} />
    </Stack>
  );
}
