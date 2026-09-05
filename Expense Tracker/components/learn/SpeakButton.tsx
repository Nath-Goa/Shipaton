import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';

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
  const [speaking, setSpeaking] = useState(false);

  // Stop mid-sentence if the screen unmounts (course switched, navigated
  // away) rather than leaving a voice talking over whatever's next.
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

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
    <Pressable onPress={toggle} hitSlop={8} style={[styles.btn, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <Ionicons name={speaking ? 'stop' : 'volume-high-outline'} size={16} color={colors.accent} />
    </Pressable>
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
