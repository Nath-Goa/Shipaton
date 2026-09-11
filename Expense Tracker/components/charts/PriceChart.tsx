import { useEffect, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Polygon } from 'react-native-svg';

import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import type { ForecastBand, PriceBar } from '@/types/stock';

type Props = {
  bars: PriceBar[];
  forecast?: ForecastBand | null;
  height?: number;
  trend?: 'up' | 'down' | 'flat';
  // Optional — fully additive. Existing call sites that don't pass this see
  // no behavior change at all; the Svg just isn't wrapped in a Pressable.
  onPointPress?: (bar: PriceBar, index: number) => void;
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const REVEAL_DURATION = 700;

export function PriceChart({ bars, forecast, height = 180, trend, onPointPress }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);

  const beaconPulse = useSharedValue(1);
  const beaconOpacity = useSharedValue(0);
  // 0 → 1 draw progress, not a pixel width. The reveal is driven by a plain
  // stroke-dashoffset animation on the line itself (below) rather than an
  // SVG <ClipPath> + animated <Rect> — the previous approach — because that
  // combination is unreliable on React Native's New Architecture: when the
  // clip rect's animated width update doesn't propagate to the renderer, the
  // clip stays pinned at its initial 0 width forever and the ENTIRE chart is
  // invisible, not just un-animated. A dashoffset on the line itself has no
  // such failure mode — worst case it just doesn't animate, the line still
  // shows immediately.
  const drawProgress = useSharedValue(0);
  // Path length is a plain per-render number (recomputed below, same as
  // `points`/`linePath` already were), mirrored into a shared value so the
  // two useAnimatedProps hooks above can stay unconditional — they're
  // declared before the early-return below, so they must not close over
  // anything only computed after it.
  const pathLengthSV = useSharedValue(0);

  useEffect(() => {
    // Draws the line left-to-right on every change of `bars` — both the
    // initial mount AND every 1W/1M/3M/1Y switch, since the caller's
    // `useMemo(() => getHistory(symbol, range), [symbol, range])` gives a
    // new array reference in both cases but NOT on the 15s live-quote poll,
    // so this never replays just because a price ticked.
    if (width === 0) return;

    if (reducedMotion) {
      // Skip the draw-in and the beacon's pulsing entirely — the line
      // renders complete immediately, and the beacon just holds at a
      // steady, visible ring instead of animating.
      drawProgress.value = 1;
      beaconPulse.value = 1;
      beaconOpacity.value = 0.8;
      return;
    }

    drawProgress.value = 0;
    drawProgress.value = withTiming(1, { duration: REVEAL_DURATION, easing: Easing.out(Easing.cubic) });

    // The pulsing beacon ring waits for the line to actually arrive at its
    // spot, then does a couple of quick pulses (~1.8s) and holds static.
    beaconPulse.value = 1;
    beaconOpacity.value = 0;
    beaconOpacity.value = withDelay(
      REVEAL_DURATION,
      withSequence(
        withTiming(0.8, { duration: 200 }),
        withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(0.8, { duration: 450 })), 2, false)
      )
    );
    beaconPulse.value = withDelay(
      REVEAL_DURATION,
      withRepeat(withSequence(withTiming(2.2, { duration: 450 }), withTiming(1, { duration: 450 })), 2, false)
    );
  }, [bars, width, drawProgress, beaconPulse, beaconOpacity, reducedMotion]);

  const beaconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: beaconPulse.value }],
      opacity: beaconOpacity.value,
    };
  });

  const lineAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLengthSV.value * (1 - drawProgress.value),
  }));
  // The endpoint dot and forecast band only make sense once the line has
  // actually arrived there — fades in over the tail end of the draw instead
  // of sitting at its final spot the whole time.
  const endAnimatedProps = useAnimatedProps(() => ({
    opacity: interpolate(drawProgress.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
  }));

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

  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    pathLength += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  pathLengthSV.value = pathLength;

  const lineColor = trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.accent;
  const lastPoint = points[points.length - 1];

  function handlePress(e: GestureResponderEvent) {
    if (!onPointPress || bars.length === 0) return;
    const x = e.nativeEvent.locationX;
    // locationX can come back non-finite when the touch target is a nested
    // SVG child rather than the Pressable itself (seen on the web preview
    // target) — never let a bad coordinate reach an out-of-range index.
    if (!Number.isFinite(x) || x > historyWidth) return;
    const index = Math.max(0, Math.min(bars.length - 1, Math.round(x / stepX)));
    const bar = bars[index];
    if (!bar) return;
    onPointPress(bar, index);
  }

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
      {/* A plain Pressable nested inside the entering= view, never carrying
          its own entrance animation — see the Reanimated+touch rule this
          codebase already follows elsewhere (e.g. ResultsCardModal). */}
      <Pressable feedbackCategory="selection" onPress={onPointPress ? handlePress : undefined} disabled={!onPointPress}>
        <Svg width={width} height={height}>
          <Path d={areaPath} fill={lineColor} fillOpacity={0.08} />
          <AnimatedPath
            d={linePath}
            stroke={lineColor}
            strokeWidth={2.5}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={[pathLength, pathLength]}
            animatedProps={lineAnimatedProps}
          />
          <AnimatedG animatedProps={endAnimatedProps}>
            <Circle cx={lastPoint[0]} cy={lastPoint[1]} r={4} fill={lineColor} />
            {forecastNode}
          </AnimatedG>
        </Svg>
      </Pressable>
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
