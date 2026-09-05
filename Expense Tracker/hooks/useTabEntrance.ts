import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// Tab root screens stay mounted in the background after their first visit
// (CLAUDE.md §5.1), so this must replay on every focus, not just the first
// — see CLAUDE.md §7 rule #3 for why that's a deliberate, settled decision,
// not something to "fix" back to once-per-session.
//
// These numbers matter as much as the mechanism does. An earlier pass to
// kill a "flutter" cut this to an 8px rise over 180ms with the stagger
// squashed to a 60ms spread — which technically still replayed on every
// focus but was far too small and too fast to actually see, so the tabs
// read as completely static and the whole feature looked broken. A visible
// entrance needs real travel and real duration; what it must not have is a
// spring, whose overshoot is what read as fluttering once this started
// replaying on every switch instead of once per session. Timing ease, no
// bounce, worst case ~660ms end to end (240ms stagger + 420ms) — well
// inside the 1.5s ceiling.
const RISE_DISTANCE = 20;
const ENTRANCE_DURATION = 420;
const MAX_STAGGER_MS = 240;
const ENTRANCE_EASING = Easing.out(Easing.cubic);

export function useTabEntrance(delayMs = 0) {
  const progress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      progress.value = 0;
      progress.value = withDelay(
        Math.min(delayMs, MAX_STAGGER_MS),
        withTiming(1, { duration: ENTRANCE_DURATION, easing: ENTRANCE_EASING })
      );
    }, [delayMs, progress])
  );

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE_DISTANCE }],
  }));
}
