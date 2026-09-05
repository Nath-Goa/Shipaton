import { createAudioPlayer } from 'expo-audio';
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

// One long-lived player per category, reused for every tap.
//
// This used to build a fresh player on every single press — and because
// triggerFeedback runs synchronously inside onPressIn, that native player
// allocation sat directly in front of the press animation and the button's
// own onPress handler. Constructing a native player is far and away the
// most expensive thing a tap did, so every button carried that cost before
// it could respond. Rewinding and replaying a player that already exists is
// comparatively free. The tradeoff is that two taps of the same category
// inside ~200ms restart the clip rather than overlapping it, which is how
// platform UI sounds behave anyway.
type Player = ReturnType<typeof createAudioPlayer>;

const players = new Map<SoundCategory, Player>();

function playerFor(category: SoundCategory): Player {
  let player = players.get(category);
  if (!player) {
    player = createAudioPlayer(SOURCES[category]);
    players.set(category, player);
  }
  return player;
}

// Build them just after startup rather than on the first tap of each
// category, so no press ever pays the allocation. Deferred a tick so it
// stays off the app's launch path.
if (Platform.OS !== 'web') {
  setTimeout(() => {
    for (const category of Object.keys(SOURCES) as SoundCategory[]) {
      try {
        playerFor(category);
      } catch {
        // A missing audio session here just means the first tap builds it.
      }
    }
  }, 0);
}

export function playSound(category: SoundCategory): void {
  if (Platform.OS === 'web') return;
  try {
    const player = playerFor(category);
    // The clip is left sitting at its end after playing, so rewind before
    // replaying. Fire-and-forget: waiting on the seek would put an async
    // round trip back into the tap path, which is the whole thing being
    // removed here.
    player.seekTo(0).catch(() => undefined);
    player.play();
  } catch {
    // Never let a sound failure (silent mode edge cases, no audio session,
    // web quirks, etc.) affect the tap itself.
  }
}
