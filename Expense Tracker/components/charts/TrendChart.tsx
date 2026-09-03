import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/useTheme';

export type TrendPoint = { label: string; value: number; highlighted?: boolean };

type Props = {
  points: TrendPoint[];
  height?: number;
  formatValue?: (value: number) => string;
};

// A minimal monthly/weekly bar chart — deliberately simple (no axes, no
// tooltips) since it's a glance-at-a-trend widget, not a full analytics view.
export function TrendChart({ points, height = 120, formatValue }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const max = Math.max(1, ...points.map((p) => p.value));
  const barGap = 8;
  const barWidth = width > 0 ? Math.max(4, (width - barGap * Math.max(0, points.length - 1)) / Math.max(1, points.length)) : 0;
  const labelHeight = 16;
  const chartHeight = height - labelHeight;

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <Svg width={width} height={height}>
            {points.map((p, i) => {
              const barHeight = Math.max(2, (p.value / max) * (chartHeight - 4));
              const x = i * (barWidth + barGap);
              const y = chartHeight - barHeight;
              return (
                <Rect
                  key={p.label + i}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill={p.highlighted ? colors.accent : colors.border}
                />
              );
            })}
          </Svg>
          <View style={[styles.labelRow, { width }]}>
            {points.map((p, i) => (
              <Text
                key={p.label + i}
                style={[styles.label, { color: p.highlighted ? colors.text : colors.text3, width: barWidth + barGap }]}
                numberOfLines={1}>
                {p.label}
              </Text>
            ))}
          </View>
          {formatValue ? (
            <View style={[styles.valueRow, { width }]}>
              {points.map((p, i) => (
                <Text
                  key={p.label + i}
                  style={[styles.value, { color: colors.text3, width: barWidth + barGap }]}
                  numberOfLines={1}>
                  {p.value > 0 ? formatValue(p.value) : ''}
                </Text>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', marginTop: 4 },
  label: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  valueRow: { flexDirection: 'row', marginTop: 2 },
  value: { fontSize: 9, textAlign: 'center' },
});
