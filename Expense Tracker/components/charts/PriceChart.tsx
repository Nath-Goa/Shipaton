import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

import { useTheme } from '@/hooks/useTheme';
import type { ForecastBand, PriceBar } from '@/types/stock';

type Props = {
  bars: PriceBar[];
  forecast?: ForecastBand | null;
  height?: number;
  trend?: 'up' | 'down' | 'flat';
};

export function PriceChart({ bars, forecast, height = 180, trend }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const beaconPulse = useSharedValue(1);
  const beaconOpacity = useSharedValue(0.8);

  useEffect(() => {
    // A couple of quick pulses (~1.8s total) rather than pulsing forever —
    // decorative animations here are capped at ~2s and then hold static.
    beaconPulse.value = withRepeat(
      withSequence(
        withTiming(2.2, { duration: 450 }),
        withTiming(1, { duration: 450 })
      ),
      2,
      false
    );
    beaconOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 450 }),
        withTiming(0.8, { duration: 450 })
      ),
      2,
      false
    );
  }, [beaconPulse, beaconOpacity]);

  const beaconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: beaconPulse.value }],
      opacity: beaconOpacity.value,
    };
  });

  function onLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  if (!bars.length || width === 0) {
    return <View style={{ height }} onLayout={onLayout} />;
  }

  const closes = bars.map((b) => b.close);
  const forecastVals = forecast ? [forecast.low, forecast.high, forecast.mid] : [];
  const allVals = [...closes, ...forecastVals];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const pad = 8;

  const historyWidth = forecast ? width * 0.76 : width;
  const forecastWidth = width - historyWidth;
  const stepX = historyWidth / Math.max(1, bars.length - 1);
  const yFor = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);

  const points: [number, number][] = closes.map((v, i) => [i * stepX, yFor(v)]);
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${height} L0,${height} Z`;

  const lineColor = trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.accent;
  const lastPoint = points[points.length - 1];

  let forecastNode = null;
  if (forecast && forecastWidth > 4) {
    const fx = historyWidth + forecastWidth;
    const yMid = yFor(forecast.mid);
    const yLow = yFor(forecast.low);
    const yHigh = yFor(forecast.high);
    const bandPoints = `${lastPoint[0]},${lastPoint[1]} ${fx},${yHigh} ${fx},${yLow}`;
    forecastNode = (
      <>
        <Polygon points={bandPoints} fill={lineColor} fillOpacity={0.14} />
        <Line
          x1={lastPoint[0]}
          y1={lastPoint[1]}
          x2={fx}
          y2={yMid}
          stroke={lineColor}
          strokeWidth={2}
          strokeDasharray="4 4"
        />
        <Circle cx={fx} cy={yMid} r={4.5} fill={lineColor} />
      </>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ height, position: 'relative' }} onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Path d={areaPath} fill={lineColor} fillOpacity={0.08} />
        <Path
          d={linePath}
          stroke={lineColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={lastPoint[0]} cy={lastPoint[1]} r={4} fill={lineColor} />
        {forecastNode}
      </Svg>
      {/* 60fps Live Pulsing Beacon Ring over latest price coordinate */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: lastPoint[0] - 8,
            top: lastPoint[1] - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: lineColor,
          },
          beaconStyle,
        ]}
      />
    </Animated.View>
  );
}
