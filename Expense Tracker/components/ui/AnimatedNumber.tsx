import { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Easing, runOnJS, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type Props = {
  value: number;
  format: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

// Counts up (or down) from the previous value to the new one whenever
// `value` changes — used for numbers worth a moment's attention on first
// paint (net worth, P&L) rather than every number in the app. Renders
// through the app's own Text (font/scale settings, rule #8 in CLAUDE.md)
// instead of the usual animated-TextInput trick, which would bypass it.
export function AnimatedNumber({ value, format, duration = 700, style, numberOfLines }: Props) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(value);
  const [display, setDisplay] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      // First paint: count up from 0 rather than snapping straight to the
      // real number, so the very first thing a user sees has some life to
      // it — skipped under reduced motion, where the celebratory count-up
      // itself is exactly the kind of decorative motion §14 asks to drop.
      if (!reducedMotion) {
        progress.value = 0;
        setDisplay(0);
      }
    }
    progress.value = withTiming(value, { duration: reducedMotion ? 0 : duration, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reducedMotion]);

  useAnimatedReaction(
    () => progress.value,
    (current) => {
      runOnJS(setDisplay)(current);
    }
  );

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {format(display)}
    </Text>
  );
}
