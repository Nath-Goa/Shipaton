import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, type ColorValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { radius } from '@/constants/theme';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Replaces the default tab button with one that gets a press-scale +
// haptic on tap and a soft fading pill behind whichever tab is active —
// `props` is intentionally untyped: it's spread straight through to the
// underlying Pressable unchanged, augmented only with animation, so it
// stays correct regardless of the exact prop shape Expo Router's bottom
// tabs pass through on a given version.
function AnimatedTabButton(props: any) {
  const { colors } = useTheme();
  const focused = !!props.accessibilityState?.selected;
  const scale = useSharedValue(1);
  const pillOpacity = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    pillOpacity.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, pillOpacity]);

  // Each handler must depend on the specific `props.onX` it calls, not just
  // [scale]/[focused] — react-navigation hands this tab button a fresh
  // onPress/onPressIn/onPressOut closure on every render, and a tab whose
  // `focused` value hasn't changed in a while (any tab other than the one
  // just left or entered) would otherwise keep calling a stale, possibly
  // outdated onPress from several renders ago — which is exactly what made
  // tapping back to an already-passed-over tab unreliable or a no-op.
  const handlePressIn = useCallback(
    (e: any) => {
      scale.value = withSpring(0.88, springs.snappy);
      props.onPressIn?.(e);
    },
    [scale, props.onPressIn]
  );

  const handlePressOut = useCallback(
    (e: any) => {
      scale.value = withSpring(1, springs.snappy);
      props.onPressOut?.(e);
    },
    [scale, props.onPressOut]
  );

  const handlePress = useCallback(
    (e: any) => {
      if (!focused) triggerFeedback('navigation');
      props.onPress?.(e);
    },
    [focused, props.onPress]
  );

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: pillOpacity.value }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[props.style, styles.tabButton, buttonStyle]}>
      <Animated.View style={[styles.pill, { backgroundColor: colors.accentSoft }, pillStyle]} />
      {props.children}
    </AnimatedPressable>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.text3,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
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

const styles = StyleSheet.create({
  tabButton: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  pill: { position: 'absolute', top: 4, bottom: 4, left: 6, right: 6, borderRadius: radius.md },
});
