import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

const RISE_DISTANCE = 20;
const FADE_DURATION = 220;
const RISE_SPRING = { damping: 16, stiffness: 100, mass: 1 };

// Tab root screens stay mounted in the background after their first visit
// (CLAUDE.md §5.1), so a plain Reanimated `entering=` prop — which only
// plays once, on mount — never replays on a repeat visit. This hook instead
// drives the same fade-up look via an ordinary animated style tied to a
// shared value that resets and re-animates on every focus. The underlying
// view is never unmounted/remounted, so a Pressable nested inside keeps its
// native identity across tab switches — sidestepping the touch hit-testing
// bug that comes specifically from Reanimated's `entering=`/`exiting=`
// mount-transition machinery (CLAUDE.md §7 rule #2), which this hook never
// invokes.
export function useTabEntrance(delayMs = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(RISE_DISTANCE);

  useFocusEffect(
    useCallback(() => {
      opacity.value = 0;
      translateY.value = RISE_DISTANCE;
      opacity.value = withDelay(delayMs, withTiming(1, { duration: FADE_DURATION }));
      translateY.value = withDelay(delayMs, withSpring(0, RISE_SPRING));
    }, [delayMs, opacity, translateY])
  );

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}
