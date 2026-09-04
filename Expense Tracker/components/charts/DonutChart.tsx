import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';

export type DonutSegment = { id: string; label: string; color: string; value: number };

type Props = {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel: string;
  centerValue: string;
  highlightId?: string | null;
  onSegmentPress?: (id: string) => void;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Draws each segment as a clockwise sweep from 0% to its final length rather
// than just fading the whole chart in — staggered per segment so the chart
// visibly "opens" like a real pie chart being drawn. Retriggers whenever
// this component instance is freshly mounted (the caller is expected to
// pass a `key` when swapping to a materially different chart — e.g. mock vs
// a saved chart — so the "opening" moment replays exactly when it should,
// per the same never-replay-on-every-render rule entrance animations
// elsewhere in this app follow).
const DRAW_DURATION = 650;
const STAGGER_MS = 90;
const DRAW_EASING = Easing.out(Easing.cubic);

function DonutSegmentArc({
  seg,
  index,
  c,
  r,
  strokeWidth,
  circumference,
  len,
  dashOffset,
  isHighlighted,
  dimmed,
  onPress,
}: {
  seg: DonutSegment;
  index: number;
  c: number;
  r: number;
  strokeWidth: number;
  circumference: number;
  len: number;
  dashOffset: number;
  isHighlighted: boolean;
  dimmed: boolean;
  onPress: () => void;
}) {
  const isWeb = Platform.OS === 'web';
  const progress = useSharedValue(0);
  const [webMounted, setWebMounted] = useState(false);

  useEffect(() => {
    if (isWeb) {
      const timer = setTimeout(() => setWebMounted(true), index * STAGGER_MS);
      return () => clearTimeout(timer);
    } else {
      progress.value = withDelay(index * STAGGER_MS, withTiming(1, { duration: DRAW_DURATION, easing: DRAW_EASING }));
    }
  }, [isWeb, index, progress]);

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: dashOffset + len * (1 - progress.value),
    };
  });

  if (isWeb) {
    return (
      <Circle
        key={seg.id}
        cx={c}
        cy={c}
        r={r}
        stroke={seg.color}
        strokeWidth={isHighlighted ? strokeWidth + 4 : strokeWidth}
        strokeDasharray={`${len} ${circumference - len}`}
        strokeDashoffset={webMounted ? dashOffset : dashOffset + len}
        strokeOpacity={dimmed ? 0.25 : 1}
        fill="none"
        strokeLinecap="butt"
        transform={`rotate(-90 ${c} ${c})`}
        {...({ onClick: onPress } as any)}
        style={{
          cursor: 'pointer',
          transition: `stroke-dashoffset ${DRAW_DURATION}ms cubic-bezier(0.33, 1, 0.68, 1), stroke-width 200ms ease, stroke-opacity 200ms ease`,
        } as any}
      />
    );
  }

  return (
    <AnimatedCircle
      key={seg.id}
      cx={c}
      cy={c}
      r={r}
      stroke={seg.color}
      strokeWidth={isHighlighted ? strokeWidth + 4 : strokeWidth}
      strokeDasharray={`${len} ${circumference - len}`}
      animatedProps={animatedProps}
      strokeOpacity={dimmed ? 0.25 : 1}
      fill="none"
      strokeLinecap="butt"
      transform={`rotate(-90 ${c} ${c})`}
      onPress={onPress}
    />
  );
}

export function DonutChart({
  segments,
  size = 180,
  strokeWidth = 22,
  centerLabel,
  centerValue,
  highlightId,
  onSegmentPress,
}: Props) {
  const { colors } = useTheme();
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;

  function handlePressSegment(id: string) {
    triggerFeedback('selection');
    onSegmentPress?.(id);
  }

  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total <= 0 ? (
          <Circle cx={c} cy={c} r={r} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        ) : (
          segments
            .filter((seg) => seg.value > 0)
            .map((seg, index) => {
              const frac = seg.value / total;
              const len = frac * circumference;
              const dashOffset = -offset;
              offset += len;
              const isHighlighted = highlightId === seg.id;
              const dimmed = !!highlightId && !isHighlighted;
              return (
                <DonutSegmentArc
                  key={seg.id}
                  seg={seg}
                  index={index}
                  c={c}
                  r={r}
                  strokeWidth={strokeWidth}
                  circumference={circumference}
                  len={len}
                  dashOffset={dashOffset}
                  isHighlighted={isHighlighted}
                  dimmed={dimmed}
                  onPress={() => handlePressSegment(seg.id)}
                />
              );
            })
        )}
      </Svg>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View key={`${centerLabel}-${centerValue}`} entering={FadeIn.duration(200)} style={styles.center}>
          <Text style={[styles.centerLabel, { color: colors.text3 }]} numberOfLines={1}>
            {centerLabel}
          </Text>
          <Text style={[styles.centerValue, { color: colors.text }]} numberOfLines={1}>
            {centerValue}
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  centerValue: {
    marginTop: 3,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
});
