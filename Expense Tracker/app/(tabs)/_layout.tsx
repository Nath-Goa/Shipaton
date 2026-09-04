import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { type ColorValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { LiquidGlassTabBar } from '@/components/navigation/LiquidGlassTabBar';
import { springs, triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';

// Deliberately kept on top of Expo Router's stock <Tabs> container (safe
// areas, platform sizing, and layout stay exactly as tested/default) — only
// the icon and button rendering are swapped for animated versions via the
// documented tabBarIcon/tabBarButton options, rather than replacing the
// whole tab bar with a hand-rolled one.

type IconName = keyof typeof Ionicons.glyphMap;

function AnimatedTabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: IconName;
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    // A small, fast overshoot rather than the old wide bouncy spring — that
    // settled slowly enough to read as "bending and oscillating" on tab
    // change. This settles in well under 200ms.
    if (focused) scale.value = withSequence(withSpring(1.12, springs.quick), withSpring(1, springs.quick));
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={name} color={color as string} size={size} />
    </Animated.View>
  );
}

function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <AnimatedTabIcon name={focused ? active : inactive} color={color} size={size} focused={focused} />
  );
}

export default function TabLayout() {
  const { colors } = useTheme();

  // Memoized so react-navigation's bottom-tabs sees the exact same function
  // identity across re-renders — an inline `() => <LiquidGlassTabBar />`
  // causes the blur background to unmount and remount.
  const renderTabBarBackground = useCallback(() => <LiquidGlassTabBar />, []);

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      tabBarActiveTintColor: colors.accent,
      tabBarInactiveTintColor: colors.text3,
      // Transparent + no default border: LiquidGlassTabBar renders the
      // blur, tint, and top hairline itself as the tab bar's background.
      tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0 },
      tabBarBackground: renderTabBarBackground,
    }),
    [colors.accent, colors.text3, renderTabBarBackground]
  );

  return (
    <Tabs
      screenOptions={screenOptions}
      screenListeners={{
        tabPress: () => {
          triggerFeedback('navigation');
        },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: tabIcon('school', 'school-outline') }} />
      <Tabs.Screen
        name="markets"
        options={{ title: 'Markets', tabBarIcon: tabIcon('stats-chart', 'stats-chart-outline') }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{ title: 'Portfolio', tabBarIcon: tabIcon('briefcase', 'briefcase-outline') }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen
        name="assistant"
        options={{ title: 'Assistant', tabBarIcon: tabIcon('sparkles', 'sparkles-outline') }}
      />
    </Tabs>
  );
}
