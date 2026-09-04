import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { radius, shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

// A "liquid glass" slide: a short jump (adjacent option) gets a quick,
// mild stretch that settles smoothly; a long jump (e.g. clear across a
// 4-way control) stretches further while travelling and then snaps back on
// arrival like it's hit a wall — a stiff, slightly overshooting spring
// rather than a smooth timing curve, so the stop actually reads as an
// impact. "Far" is relative to the control's own span so this scales
// correctly whether it's a 2-way or 4-way segmented control.
const FAR_JUMP_FRACTION = 0.5;
const NEAR_STRETCH = 1.14;
const FAR_STRETCH = 1.4;

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const activeIndex = options.findIndex((opt) => opt.value === value);
  const count = Math.max(1, options.length);
  const padding = 3;
  const usableWidth = Math.max(0, containerWidth - padding * 2);
  const itemWidth = usableWidth / count;

  const translateX = useSharedValue(0);
  const stretch = useSharedValue(1);
  const prevIndexRef = useRef(activeIndex);

  useEffect(() => {
    if (usableWidth <= 0 || activeIndex < 0) return;
    const fromIndex = prevIndexRef.current;
    const distanceSteps = Math.abs(activeIndex - fromIndex);
    const isFar = count > 2 && distanceSteps / (count - 1) >= FAR_JUMP_FRACTION;
    const targetX = activeIndex * itemWidth;

    if (isFar) {
      translateX.value = withTiming(targetX, { duration: 300, easing: Easing.out(Easing.cubic) });
      stretch.value = withSequence(
        withTiming(FAR_STRETCH, { duration: 150, easing: Easing.out(Easing.quad) }),
        withSpring(1, springs.snappy)
      );
    } else {
      translateX.value = withTiming(targetX, { duration: 180, easing: Easing.out(Easing.cubic) });
      stretch.value = withSequence(
        withTiming(NEAR_STRETCH, { duration: 80, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) })
      );
    }
    prevIndexRef.current = activeIndex;
    // Only the index and layout should retrigger this — itemWidth/count
    // derive from usableWidth already in the dep list via containerWidth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, usableWidth]);

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      width: itemWidth,
      transform: [{ translateX: translateX.value }, { scaleX: stretch.value }],
    };
  });

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    setContainerWidth(w);
    if (activeIndex >= 0 && usableWidth === 0) {
      // First measurement — snap straight to position, no animation.
      const uW = Math.max(0, w - padding * 2);
      const iW = uW / count;
      translateX.value = activeIndex * iW;
    }
  }

  function handleSelect(optValue: T) {
    if (optValue !== value) {
      triggerFeedback('selection');
      onChange(optValue);
    }
  }

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrap, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      {usableWidth > 0 && (
        <Animated.View
          style={[
            styles.indicator,
            {
              left: padding,
              top: padding,
              bottom: padding,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
            shadow.sm,
            indicatorStyle,
          ]}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <SegmentItem
            key={opt.value}
            label={opt.label}
            active={active}
            color={active ? colors.text : colors.text3}
            onPress={() => handleSelect(opt.value)}
          />
        );
      })}
    </View>
  );
}

function SegmentItem({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.94, springs.snappy);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.seg, animatedStyle]}>
      <Text style={[styles.label, { color }, active && styles.activeLabel]}>{label}</Text>
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },
  indicator: {
    position: 'absolute',
    borderRadius: radius.sm - 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  seg: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm - 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  activeLabel: {
    fontWeight: '700',
  },
});
