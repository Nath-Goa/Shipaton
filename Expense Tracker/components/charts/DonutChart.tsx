import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, Keyframe } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

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
    <Animated.View entering={FadeIn.duration(400)} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {total <= 0 ? (
          <Circle cx={c} cy={c} r={r} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        ) : (
          segments
            .filter((seg) => seg.value > 0)
            .map((seg) => {
              const frac = seg.value / total;
              const len = frac * circumference;
              const dashOffset = -offset;
              offset += len;
              const isHighlighted = highlightId === seg.id;
              const dimmed = !!highlightId && !isHighlighted;
              return (
                <Circle
                  key={seg.id}
                  cx={c}
                  cy={c}
                  r={r}
                  stroke={seg.color}
                  strokeWidth={isHighlighted ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={`${len} ${circumference - len}`}
                  strokeDashoffset={dashOffset}
                  strokeOpacity={dimmed ? 0.25 : 1}
                  fill="none"
                  strokeLinecap="butt"
                  transform={`rotate(-90 ${c} ${c})`}
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
