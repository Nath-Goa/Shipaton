import { createAudioPlayer, preload } from 'expo-audio';
import { Platform } from 'react-native';

// Short (<200ms), synthesized UI sound effects — one distinct clip per
// interaction category, kept intentionally tiny (a few KB each) since
// they're purely tap feedback, not content. Deliberately doesn't touch
// setAudioModeAsync, so these respect the device's silent/mute switch like
// any other native UI sound (haptics, via constants/animations.ts's
// triggerHaptic, always fire regardless — that split matches standard
// iOS/Android behavior).

export type SoundCategory = 'primary' | 'secondary' | 'destructive' | 'selection' | 'navigation' | 'success' | 'error';

const SOURCES: Record<SoundCategory, number> = {
  primary: require('@/assets/sounds/primary.wav'),
  secondary: require('@/assets/sounds/secondary.wav'),
  destructive: require('@/assets/sounds/destructive.wav'),
  selection: require('@/assets/sounds/selection.wav'),
  navigation: require('@/assets/sounds/navigation.wav'),
  success: require('@/assets/sounds/success.wav'),
  error: require('@/assets/sounds/error.wav'),
};

// Preloaded once at module scope (per expo-audio's own guidance) so the
// very first tap of each category plays with no load delay.
if (Platform.OS !== 'web') {
  for (const source of Object.values(SOURCES)) {
    preload(source).catch(() => undefined);
  }
}

// A fresh player per play (rather than one reused player) so two taps in
// quick succession both produce a sound instead of the second cutting off
// the first — each is disposed shortly after its clip finishes.
export function playSound(category: SoundCategory): void {
  if (Platform.OS === 'web') return;
  try {
    const player = createAudioPlayer(SOURCES[category]);
    player.play();
    setTimeout(() => {
      try {
        player.remove();
      } catch {
        // already released
      }
    }, 400);
  } catch {
    // Never let a sound failure (silent mode edge cases, no audio session,
    // web quirks, etc.) affect the tap itself.
  }
}
