import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// A tiny, deliberately plain Flappy Bird clone — shown only while an AI
// response is loading, to give the wait something to do. Physics run on
// plain refs each animation frame (no React re-renders on every frame);
// Animated.Value drives the smooth on-screen motion, and React state only
// updates for the infrequent, meaningful moments (score, death, a pipe's
// gap repositioning). The parent is expected to unmount this the instant
// loading finishes, which alone stops the animation frame loop via the
// effect cleanup below — no extra "stop" call needed.

const WIDTH = 240;
const HEIGHT = 140;
const BIRD_SIZE = 12;
const BIRD_X = 32;
const GRAVITY = 900;
const JUMP_VELOCITY = -300;
const PIPE_WIDTH = 22;
const PIPE_GAP = 56;
const PIPE_SPEED = 85;
const PIPE_SPACING = 130;

type Pipe = { x: number; gapY: number; scored: boolean };

function randomGapY(): number {
  const margin = 18;
  return margin + Math.random() * (HEIGHT - PIPE_GAP - margin * 2);
}

function initialPipes(): Pipe[] {
  return [
    { x: WIDTH, gapY: randomGapY(), scored: false },
    { x: WIDTH + PIPE_SPACING, gapY: randomGapY(), scored: false },
  ];
}

export function FlappyBirdLoader() {
  const { colors } = useTheme();

  const birdY = useRef(new Animated.Value(HEIGHT / 2)).current;
  const pipeX = useRef([new Animated.Value(WIDTH), new Animated.Value(WIDTH + PIPE_SPACING)]).current;

  const birdYRef = useRef(HEIGHT / 2);
  const velocityRef = useRef(0);
  const pipesRef = useRef<Pipe[]>(initialPipes());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const [, setLayoutTick] = useState(0);

  function reset() {
    birdYRef.current = HEIGHT / 2;
    velocityRef.current = 0;
    pipesRef.current = initialPipes();
    setScore(0);
    setDead(false);
    setLayoutTick((t) => t + 1);
  }

  function flap() {
    if (dead) {
      reset();
      return;
    }
    velocityRef.current = JUMP_VELOCITY;
  }

  useEffect(() => {
    function loop(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
      lastTsRef.current = ts;

      if (!dead) {
        velocityRef.current += GRAVITY * dt;
        birdYRef.current += velocityRef.current * dt;

        let collided = birdYRef.current <= 0 || birdYRef.current + BIRD_SIZE >= HEIGHT;
        let gapChanged = false;

        for (const pipe of pipesRef.current) {
          pipe.x -= PIPE_SPEED * dt;
          if (pipe.x + PIPE_WIDTH < 0) {
            pipe.x += PIPE_SPACING * 2;
            pipe.gapY = randomGapY();
            pipe.scored = false;
            gapChanged = true;
          }
          const overlapsX = BIRD_X + BIRD_SIZE > pipe.x && BIRD_X < pipe.x + PIPE_WIDTH;
          if (overlapsX && (birdYRef.current < pipe.gapY || birdYRef.current + BIRD_SIZE > pipe.gapY + PIPE_GAP)) {
            collided = true;
          }
          if (!pipe.scored && pipe.x + PIPE_WIDTH < BIRD_X) {
            pipe.scored = true;
            setScore((s) => s + 1);
          }
        }

        birdY.setValue(birdYRef.current);
        pipeX[0].setValue(pipesRef.current[0].x);
        pipeX[1].setValue(pipesRef.current[1].x);
        if (gapChanged) setLayoutTick((t) => t + 1);
        if (collided) setDead(true);
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dead]);

  return (
    <Pressable
      onPress={flap}
      style={[styles.wrap, { width: WIDTH, height: HEIGHT, backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <Text style={[styles.score, { color: colors.text3 }]}>{dead ? 'Tap to retry' : score}</Text>
      <Animated.View
        style={[styles.bird, { backgroundColor: colors.accent, left: BIRD_X, transform: [{ translateY: birdY }] }]}
      />
      {pipesRef.current.map((pipe, i) => (
        <View key={i} pointerEvents="none">
          <Animated.View
            style={[
              styles.pipe,
              { backgroundColor: colors.text3, top: 0, height: pipe.gapY, transform: [{ translateX: pipeX[i] }] },
            ]}
          />
          <Animated.View
            style={[
              styles.pipe,
              {
                backgroundColor: colors.text3,
                top: pipe.gapY + PIPE_GAP,
                height: HEIGHT - pipe.gapY - PIPE_GAP,
                transform: [{ translateX: pipeX[i] }],
              },
            ]}
          />
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignSelf: 'center',
    marginVertical: 8,
  },
  score: { position: 'absolute', top: 6, alignSelf: 'center', fontSize: 12, fontWeight: '700', zIndex: 1 },
  bird: { position: 'absolute', width: BIRD_SIZE, height: BIRD_SIZE, borderRadius: BIRD_SIZE / 2 },
  pipe: { position: 'absolute', width: PIPE_WIDTH },
});
