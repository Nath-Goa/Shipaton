import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/useTheme';
import type { BenchmarkPoint } from '@/utils/portfolioMath';
import { signedPct } from '@/utils/money';

type Props = {
  points: BenchmarkPoint[];
  height?: number;
};

export function BenchmarkChart({ points, height = 160 }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (points.length < 2 || width === 0) {
    return <View style={{ height }} onLayout={onLayout} />;
  }

  const allVals = points.flatMap((p) => [p.portfolioPct, p.benchmarkPct]);
  const min = Math.min(0, ...allVals);
  const max = Math.max(0, ...allVals);
  const range = max - min || 1;
  const pad = 8;
  const stepX = width / Math.max(1, points.length - 1);
  const yFor = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);

  const pathFor = (key: 'portfolioPct' | 'benchmarkPct') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * stepX).toFixed(1)},${yFor(p[key]).toFixed(1)}`).join(' ');

  const last = points[points.length - 1];

  return (
    <Animated.View entering={FadeIn.duration(300)} onLayout={onLayout}>
      <Svg width={width} height={height}>
        {min < 0 && max > 0 ? (
          <Path d={`M0,${yFor(0)} L${width},${yFor(0)}`} stroke={colors.border} strokeWidth={1} strokeDasharray="3 3" />
        ) : null}
        <Path d={pathFor('benchmarkPct')} stroke={colors.text3} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Path
          d={pathFor('portfolioPct')}
          stroke={colors.accent}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.legend}>
        <LegendItem color={colors.accent} label="You" value={last.portfolioPct} textColor={colors.text2} />
        <LegendItem color={colors.text3} label="Market avg" value={last.benchmarkPct} textColor={colors.text2} />
      </View>
    </Animated.View>
  );
}

function LegendItem({ color, label, value, textColor }: { color: string; label: string; value: number; textColor: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, { color: textColor }]}>
        {label} {signedPct(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, fontWeight: '600' },
});
