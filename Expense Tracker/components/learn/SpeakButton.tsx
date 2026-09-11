import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// "Read aloud" for lesson/story text — expo-speech, a genuinely new native
// module (see CLAUDE.md §10): this component and every call site are
// correct as written, but nothing here actually speaks until a new EAS
// build ships with the module compiled in. Free tier, no AI call — this is
// on-device text-to-speech, not a generated voice.

// The platform default voice reads noticeably more robotic (flat pitch,
// slightly rushed) than what's actually available on-device. iOS in
// particular ships much more natural-sounding "Enhanced"/"Premium" quality
// voices alongside the default "Compact" one, but expo-speech never picks
// one unless asked explicitly by identifier. Looked up once (an async
// native call) and cached module-wide rather than re-queried on every
// press.
let bestVoicePromise: Promise<string | undefined> | null = null;

function bestVoiceId(): Promise<string | undefined> {
  if (!bestVoicePromise) {
    bestVoicePromise = Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const english = voices.filter((v) => v.language?.toLowerCase().startsWith('en'));
        const enhanced = english.find((v) => v.quality === Speech.VoiceQuality.Enhanced);
        return (enhanced ?? english[0])?.identifier;
      })
      .catch(() => undefined);
  }
  return bestVoicePromise;
}

export function SpeakButton({ text }: { text: string }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const [speaking, setSpeaking] = useState(false);
  const scale = useSharedValue(1);

  // Stop mid-sentence if the screen unmounts (course switched, navigated
  // away) rather than leaving a voice talking over whatever's next.
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const handlePressIn = useCallback(() => {
    scale.value = reducedMotion ? 1 : withSpring(0.9, springs.tap);
  }, [scale, reducedMotion]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.tap);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  async function toggle() {
    triggerFeedback('secondary');
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const voice = await bestVoiceId();
    Speech.speak(text, {
      voice,
      // Slightly slower and a touch lower than the 1.0/1.0 default reads as
      // a calmer, more natural pace instead of a rushed, flat monotone —
      // small nudges, not a caricature.
      rate: 0.94,
      pitch: 0.96,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  return (
    <AnimatedPressable
      onPress={toggle}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      hitSlop={8}
      style={[styles.btn, { backgroundColor: colors.surface2, borderColor: colors.border }, animatedStyle]}>
      <Ionicons name={speaking ? 'stop' : 'volume-high-outline'} size={16} color={colors.accent} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
