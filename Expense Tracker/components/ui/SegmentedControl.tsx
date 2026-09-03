import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { radius, shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const activeIndex = options.findIndex((opt) => opt.value === value);
  const count = Math.max(1, options.length);
  const padding = 3;
  const usableWidth = Math.max(0, containerWidth - padding * 2);
  const itemWidth = usableWidth / count;

  const translateX = useSharedValue(0);

  useEffect(() => {
    if (usableWidth > 0 && activeIndex >= 0) {
      translateX.value = withSpring(activeIndex * itemWidth, springs.gentle);
    }
  }, [activeIndex, usableWidth, itemWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      width: itemWidth,
      transform: [{ translateX: translateX.value }],
    };
  });

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    setContainerWidth(w);
    if (activeIndex >= 0) {
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
