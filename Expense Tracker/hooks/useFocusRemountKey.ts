import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

// Expo Router's tab navigator keeps every tab's root screen mounted in the
// background after its first visit (so scroll position/state survive a tab
// switch) — but that means a react-native-reanimated `entering=` animation,
// which only plays once on mount, never replays when you come back to a
// tab you've already opened. Apply the returned key to a <View> wrapping
// just the entrance-animated content (not any FlatList/ScrollView holding
// it, so scroll position stays put) to force that content to remount, and
// its entrance animations to replay, every time the screen regains focus.
// Skips the very first focus so nothing double-plays alongside the natural
// initial mount.
export function useFocusRemountKey(): number {
  const [key, setKey] = useState(0);
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setKey((k) => k + 1);
    }, [])
  );

  return key;
}
