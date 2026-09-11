import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { springs } from '@/constants/animations';
import { radius } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

// score: -100 (very bearish) .. 100 (very bullish)
export function SentimentGauge({ score }: { score: number }) {
  const { colors } = useTheme();
  const clamped = Math.max(-100, Math.min(100, score));
  const targetPct = (clamped + 100) / 2; // 0..100

  const markerPct = useSharedValue(targetPct);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    markerPct.value = withSpring(targetPct, springs.gauge);
  }, [targetPct, markerPct]);

  useEffect(() => {
    // A single up-down pulse (2s total) rather than an endless loop —
    // decorative animations here are capped at ~2s and then hold static.
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      1,
      true
    );
  }, [pulseScale]);

  const markerAnimatedStyle = useAnimatedStyle(() => {
    return {
      left: `${markerPct.value}%`,
      transform: [{ scale: pulseScale.value }],
    };
  });

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.fillNeg, { backgroundColor: colors.dangerSoft }]} />
        <View style={[styles.fillPos, { backgroundColor: colors.successSoft }]} />
        <Animated.View
          style={[
            styles.marker,
            { backgroundColor: clamped >= 0 ? colors.success : colors.danger },
            markerAnimatedStyle,
          ]}
        />
      </View>
      <View style={styles.labels}>
        <Text style={[styles.labelText, { color: colors.text3 }]}>Bearish</Text>
        <Text style={[styles.labelText, { color: colors.text3 }]}>Neutral</Text>
        <Text style={[styles.labelText, { color: colors.text3 }]}>Bullish</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  track: {
    height: 8,
    borderRadius: radius.pill,
    overflow: 'visible',
    flexDirection: 'row',
  },
  fillNeg: { flex: 1, borderTopLeftRadius: radius.pill, borderBottomLeftRadius: radius.pill },
  fillPos: { flex: 1, borderTopRightRadius: radius.pill, borderBottomRightRadius: radius.pill },
  marker: {
    position: 'absolute',
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  labelText: { fontSize: 10.5, letterSpacing: trackingFor(10.5), fontWeight: '600' },
});
