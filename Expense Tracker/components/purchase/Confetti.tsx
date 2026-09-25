import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// Two party-cannon volleys fired from the bottom corners. Each piece follows
// projectile motion with linear air drag, the closed-form solution of
// v' = g - k·v, so it shoots up fast, slows near its peak, then drifts down
// at a gentle terminal speed like real paper instead of dropping like a rock.
// Remount (change the `key`) to fire another burst.

const DRAG = 3; // k, 1/s
const GRAVITY = 700; // px/s²; terminal fall speed is GRAVITY / DRAG ≈ 233 px/s

type Piece = {
  fromLeft: boolean;
  vx: number; // px/s, always positive; mirrored for the right cannon
  vy: number; // px/s, negative is up
  delay: number;
  duration: number;
  width: number;
  height: number;
  round: boolean;
  color: string;
  spin: number; // deg/s
  flip: number; // rad/s, drives the paper-flutter scaleY
  swayAmp: number;
  swayFreq: number;
  phase: number;
};

function makePieces(count: number, width: number, height: number, colors: string[]): Piece[] {
  // Scaled to the screen so a tall phone gets the same "reaches two thirds
  // of the way up" arc as a short one.
  const reach = height / 800;
  const spread = width / 400;
  return Array.from({ length: count }, (_, i) => {
    const strip = Math.random() < 0.3;
    const round = !strip && Math.random() < 0.25;
    const size = 7 + Math.random() * 6;
    return {
      fromLeft: i % 2 === 0,
      vx: (150 + Math.random() * 850) * spread,
      vy: -(1700 + Math.random() * 900) * reach,
      delay: Math.random() * 260,
      duration: 3200 + Math.random() * 1200,
      width: strip ? 4 : size,
      height: strip ? size * 1.9 : round ? size : size * 0.6,
      round,
      color: colors[i % colors.length],
      spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 540),
      flip: 4 + Math.random() * 8,
      swayAmp: 10 + Math.random() * 22,
      swayFreq: 2 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
    };
  });
}

type Props = { colors: string[]; count?: number };

export function Confetti({ colors, count = 64 }: Props) {
  const { width, height } = useWindowDimensions();
  // Rolled once per mount so a re-render never reshuffles pieces mid-flight.
  const [pieces] = useState(() => makePieces(count, width, height, colors));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, i) => (
        <ConfettiPiece key={i} piece={piece} screenWidth={width} screenHeight={height} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, screenWidth, screenHeight }: { piece: Piece; screenWidth: number; screenHeight: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(piece.delay, withTiming(1, { duration: piece.duration, easing: Easing.linear }));
  }, [progress, piece]);

  const style = useAnimatedStyle(() => {
    const s = (progress.value * piece.duration) / 1000;
    const decay = 1 - Math.exp(-DRAG * s);
    const terminal = GRAVITY / DRAG;
    const dx = (piece.vx * decay) / DRAG;
    const sway = Math.sin(s * piece.swayFreq + piece.phase) * piece.swayAmp * decay;
    const x = piece.fromLeft ? -12 + dx + sway : screenWidth + 12 - dx + sway;
    const y = screenHeight + 12 + terminal * s + ((piece.vy - terminal) * decay) / DRAG;
    return {
      opacity: progress.value === 0 ? 0 : progress.value > 0.85 ? (1 - progress.value) / 0.15 : 1,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.spin * s}deg` },
        { scaleY: Math.cos(piece.flip * s) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.width,
          height: piece.height,
          borderRadius: piece.round ? piece.width / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
});
