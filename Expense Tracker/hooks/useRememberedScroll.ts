import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useQolStore } from '@/store/useQolStore';

export function useRememberedScroll(key: string) {
  const ref = useRef<ScrollView>(null);
  const enabled = useQolStore((state) => state.rememberScroll);
  const savedY = useQolStore((state) => state.scrollPositions[key] ?? 0);
  const save = useQolStore((state) => state.saveScrollPosition);
  const lastReselectedTab = useQolStore((state) => state.lastReselectedTab);
  const tabReselectEpoch = useQolStore((state) => state.tabReselectEpoch);

  useEffect(() => {
    if (lastReselectedTab === key && tabReselectEpoch > 0) ref.current?.scrollTo({ y: 0, animated: true });
  }, [key, lastReselectedTab, tabReselectEpoch]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || savedY <= 0) return;
      const frame = requestAnimationFrame(() => ref.current?.scrollTo({ y: savedY, animated: false }));
      return () => cancelAnimationFrame(frame);
    }, [enabled, savedY])
  );

  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (enabled) save(key, event.nativeEvent.contentOffset.y);
  }, [enabled, key, save]);

  return { ref, onMomentumScrollEnd };
}
