import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const RISE_DISTANCE = 14;
// A plain ease-out timing, not a spring — a spring's slight overshoot-and-
// settle reads as a "flutter" once it's replaying on every tab switch
// instead of once per session. Worst case across the app is a 260ms stagger
// delay (Home's last section) plus this duration, ~520ms total — well
// under the 1.5s ceiling every tab entrance must stay under.
const ENTRANCE_DURATION = 260;
const ENTRANCE_EASING = Easing.out(Easing.cubic);

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
  const progress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      progress.value = 0;
      progress.value = withDelay(delayMs, withTiming(1, { duration: ENTRANCE_DURATION, easing: ENTRANCE_EASING }));
    }, [delayMs, progress])
  );

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE_DISTANCE }],
  }));
}
