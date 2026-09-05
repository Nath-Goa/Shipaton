import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { SlidingTabs } from '@/components/navigation/SlidingTabs';
import { springs } from '@/constants/animations';

// Tabs slide horizontally between screens (see components/navigation/
// SlidingTabs.tsx) — every tab sits in one long row, so jumping several
// tabs at once travels past the ones in between instead of cutting
// straight there.

type IconName = keyof typeof Ionicons.glyphMap;

function AnimatedTabIcon({ name, color, size, focused }: { name: IconName; color: string; size: number; focused: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    // A small, fast overshoot rather than a wide bouncy spring — that
    // settled slowly enough to read as "bending and oscillating" on tab
    // change. This settles in well under 200ms.
    if (focused) scale.value = withSequence(withSpring(1.12, springs.quick), withSpring(1, springs.quick));
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={name} color={color} size={size} />
    </Animated.View>
  );
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <AnimatedTabIcon name={focused ? active : inactive} color={color} size={size} focused={focused} />
  );
}

export default function TabLayout() {
  return (
    <SlidingTabs>
      <SlidingTabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <SlidingTabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: tabIcon('school', 'school-outline') }} />
      <SlidingTabs.Screen
        name="markets"
        options={{ title: 'Markets', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
      />
      <SlidingTabs.Screen
        name="news"
        options={{ title: 'News', tabBarIcon: tabIcon('newspaper', 'newspaper-outline') }}
      />
      <SlidingTabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <SlidingTabs.Screen
        name="assistant"
        options={{ title: 'Assistant', tabBarIcon: tabIcon('sparkles', 'sparkles-outline') }}
      />
    </SlidingTabs>
  );
}
