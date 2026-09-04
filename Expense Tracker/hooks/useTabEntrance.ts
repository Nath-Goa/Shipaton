import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const RISE_DISTANCE = 8;
const ENTRANCE_DURATION = 180;
const ENTRANCE_EASING = Easing.out(Easing.cubic);

export function useTabEntrance(delayMs = 0) {
  const progress = useSharedValue(0);

  useFocusEffect(
    useCallback(() => {
      progress.value = 0;
      const smoothDelay = Math.min(delayMs * 0.35, 60);
      progress.value = withDelay(smoothDelay, withTiming(1, { duration: ENTRANCE_DURATION, easing: ENTRANCE_EASING }));
    }, [delayMs, progress])
  );

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * RISE_DISTANCE }],
  }));
}
