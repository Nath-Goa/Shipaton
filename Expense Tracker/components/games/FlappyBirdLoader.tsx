import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const WIDTH = 264;
const HEIGHT = 156;
const GROUND = 12;
const PLAY_HEIGHT = HEIGHT - GROUND;
const BIRD_WIDTH = 25;
const BIRD_HEIGHT = 19;
const BIRD_X = 38;
const GRAVITY = 1120;
const FLAP_VELOCITY = -220;
const PIPE_WIDTH = 30;
const PIPE_GAP = 66;
const PIPE_SPEED = 102;
const PIPE_SPACING = 150;
const GAP_MARGIN = 20;

function randomGapY() {
  'worklet';
  return GAP_MARGIN + Math.random() * (PLAY_HEIGHT - PIPE_GAP - GAP_MARGIN * 2);
}

export function FlappyBirdLoader() {
  const { colors, scheme } = useTheme();
  const birdY = useSharedValue(PLAY_HEIGHT / 2);
  const velocity = useSharedValue(0);
  const pipe1X = useSharedValue(WIDTH + 25);
  const pipe2X = useSharedValue(WIDTH + 25 + PIPE_SPACING);
  const pipe1Gap = useSharedValue(randomGapY());
  const pipe2Gap = useSharedValue(randomGapY());
  const running = useSharedValue(true);
  const scored1 = useSharedValue(false);
  const scored2 = useSharedValue(false);
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);

  const addPoint = useCallback(() => setScore((value) => value + 1), []);
  const endGame = useCallback(() => {
    setDead(true);
    running.value = false;
  }, [running]);

  useFrameCallback((frame) => {
    'worklet';
    if (!running.value || frame.timeSincePreviousFrame == null) return;
    const dt = Math.min(frame.timeSincePreviousFrame / 1000, 0.032);
    velocity.value += GRAVITY * dt;
    birdY.value += velocity.value * dt;
    pipe1X.value -= PIPE_SPEED * dt;
    pipe2X.value -= PIPE_SPEED * dt;

    if (pipe1X.value + PIPE_WIDTH < 0) {
      pipe1X.value += PIPE_SPACING * 2;
      pipe1Gap.value = randomGapY();
      scored1.value = false;
    }
    if (pipe2X.value + PIPE_WIDTH < 0) {
      pipe2X.value += PIPE_SPACING * 2;
      pipe2Gap.value = randomGapY();
      scored2.value = false;
    }
    if (!scored1.value && pipe1X.value + PIPE_WIDTH < BIRD_X) {
      scored1.value = true;
      runOnJS(addPoint)();
    }
    if (!scored2.value && pipe2X.value + PIPE_WIDTH < BIRD_X) {
      scored2.value = true;
      runOnJS(addPoint)();
    }

    const hitsPipe = (x: number, gap: number) =>
      BIRD_X + BIRD_WIDTH > x && BIRD_X < x + PIPE_WIDTH &&
      (birdY.value + 3 < gap || birdY.value + BIRD_HEIGHT - 3 > gap + PIPE_GAP);
    if (birdY.value < 0 || birdY.value + BIRD_HEIGHT > PLAY_HEIGHT ||
        hitsPipe(pipe1X.value, pipe1Gap.value) || hitsPipe(pipe2X.value, pipe2Gap.value)) {
      runOnJS(endGame)();
    }
  });

  const birdStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: birdY.value }, { rotate: `${Math.max(-18, Math.min(55, velocity.value * 0.08))}deg` }],
  }));
  const pipe1Top = useAnimatedStyle(() => ({ height: pipe1Gap.value, transform: [{ translateX: pipe1X.value }] }));
  const pipe1Bottom = useAnimatedStyle(() => ({ top: pipe1Gap.value + PIPE_GAP, height: PLAY_HEIGHT - pipe1Gap.value - PIPE_GAP, transform: [{ translateX: pipe1X.value }] }));
  const pipe2Top = useAnimatedStyle(() => ({ height: pipe2Gap.value, transform: [{ translateX: pipe2X.value }] }));
  const pipe2Bottom = useAnimatedStyle(() => ({ top: pipe2Gap.value + PIPE_GAP, height: PLAY_HEIGHT - pipe2Gap.value - PIPE_GAP, transform: [{ translateX: pipe2X.value }] }));

  const flap = useCallback(() => {
    if (dead) {
      birdY.value = PLAY_HEIGHT / 2;
      velocity.value = 0;
      pipe1X.value = WIDTH + 25;
      pipe2X.value = WIDTH + 25 + PIPE_SPACING;
      pipe1Gap.value = randomGapY();
      pipe2Gap.value = randomGapY();
      scored1.value = false;
      scored2.value = false;
      running.value = true;
      setScore(0);
      setDead(false);
    } else {
      velocity.value = FLAP_VELOCITY;
    }
  }, [birdY, dead, pipe1Gap, pipe1X, pipe2Gap, pipe2X, running, scored1, scored2, velocity]);

  return (
    <Pressable
      feedbackCategory="primary"
      onPressIn={flap}
      style={[
        styles.wrap,
        { backgroundColor: scheme === 'dark' ? '#13283A' : '#9DE4FF', borderColor: colors.border },
      ]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.cloud, styles.cloudOne]}><View style={styles.cloudPuff} /></View>
        <View style={[styles.cloud, styles.cloudTwo]}><View style={styles.cloudPuff} /></View>
        <Text style={styles.score}>{dead ? 'Tap to fly again' : score}</Text>
        <Pipe animatedStyle={pipe1Top} top />
        <Pipe animatedStyle={pipe1Bottom} />
        <Pipe animatedStyle={pipe2Top} top />
        <Pipe animatedStyle={pipe2Bottom} />
        <Animated.View style={[styles.bird, birdStyle]}>
          <View style={styles.tail} />
          <View style={styles.birdBody}>
            <View style={styles.belly} />
            <View style={styles.wing} />
            <View style={styles.eye}><View style={styles.pupil} /></View>
            <View style={styles.beak} />
          </View>
        </Animated.View>
        <View style={styles.ground}><View style={styles.groundStripe} /></View>
        <Text style={styles.hint}>{dead ? 'Ready?' : 'Tap anywhere to flap'}</Text>
      </View>
    </Pressable>
  );
}

function Pipe({ animatedStyle, top = false }: { animatedStyle: object; top?: boolean }) {
  return <Animated.View style={[styles.pipe, animatedStyle]}><View style={styles.pipeShade} /><View style={styles.pipeShine} /><View style={[styles.pipeCap, top ? styles.topCap : styles.bottomCap]}><View style={styles.capShine} /></View></Animated.View>;
}

const styles = StyleSheet.create({
  wrap: { width: WIDTH, height: HEIGHT, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: 'hidden', alignSelf: 'center', marginVertical: 8 },
  score: { position: 'absolute', top: 7, alignSelf: 'center', fontSize: 16, fontWeight: '900', color: '#FFF', zIndex: 4, textShadowColor: '#174A6277', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  hint: { position: 'absolute', bottom: 15, alignSelf: 'center', color: '#FFFFFFDD', fontSize: 9, fontWeight: '800', zIndex: 5 },
  cloud: { position: 'absolute', width: 52, height: 13, borderRadius: 20, backgroundColor: '#FFFFFF55' },
  cloudPuff: { position: 'absolute', left: 12, top: -8, width: 25, height: 20, borderRadius: 20, backgroundColor: '#FFFFFF55' },
  cloudOne: { left: 15, top: 27 }, cloudTwo: { right: 23, top: 50, transform: [{ scale: 0.72 }] },
  bird: { position: 'absolute', left: BIRD_X, top: 0, width: BIRD_WIDTH, height: BIRD_HEIGHT, zIndex: 3 },
  birdBody: { flex: 1, borderRadius: 12, backgroundColor: '#FFD43B', borderWidth: 1.5, borderColor: '#9B5B13', overflow: 'visible' },
  belly: { position: 'absolute', right: 1, bottom: 1, width: 13, height: 6, borderBottomRightRadius: 9, borderBottomLeftRadius: 7, backgroundColor: '#FFF1A8' },
  wing: { position: 'absolute', left: 1, top: 8, width: 13, height: 8, borderRadius: 8, backgroundColor: '#F49B20', borderWidth: 1, borderColor: '#9B5B13', transform: [{ rotate: '-12deg' }] },
  tail: { position: 'absolute', left: -6, top: 7, width: 10, height: 9, backgroundColor: '#F49B20', borderWidth: 1, borderColor: '#9B5B13', transform: [{ rotate: '45deg' }] },
  eye: { position: 'absolute', right: 3, top: 3, width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFF' },
  pupil: { position: 'absolute', right: 1, top: 2, width: 3, height: 3, borderRadius: 2, backgroundColor: '#17212B' },
  beak: { position: 'absolute', right: -7, top: 8, width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#FF6B35' },
  pipe: { position: 'absolute', left: 0, top: 0, width: PIPE_WIDTH, backgroundColor: '#39B54A', borderLeftWidth: 2, borderRightWidth: 2, borderColor: '#16712D', zIndex: 2 },
  pipeShine: { position: 'absolute', left: 4, top: 0, width: 5, height: '100%', backgroundColor: '#82E06F88' },
  pipeShade: { position: 'absolute', right: 2, top: 0, width: 6, height: '100%', backgroundColor: '#16712D55' },
  pipeCap: { position: 'absolute', left: -4, width: PIPE_WIDTH + 8, height: 10, borderWidth: 2, borderColor: '#16712D', backgroundColor: '#48C958', borderRadius: 3 },
  capShine: { position: 'absolute', left: 4, top: 1, width: 6, bottom: 1, borderRadius: 2, backgroundColor: '#9BED7F88' },
  topCap: { bottom: 0 }, bottomCap: { top: 0 },
  ground: { position: 'absolute', bottom: 0, left: 0, right: 0, height: GROUND, backgroundColor: '#78C850', borderTopWidth: 2, borderTopColor: '#E8D75A', zIndex: 4 },
  groundStripe: { height: 4, backgroundColor: '#A7DA65' },
});
