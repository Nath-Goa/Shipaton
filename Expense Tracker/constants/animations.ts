import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { playSound, type SoundCategory } from '@/services/sound/soundEffects';
import { useQolStore } from '@/store/useQolStore';

export type { SoundCategory };

/**
 * Production-grade spring configurations tailored for 60fps mobile UI interactions.
 *
 * Named per the apple-design skill's damping-ratio/response model (§4):
 * damping ratio 1.0 = critically damped/no overshoot (the default for most
 * UI), ~0.8 = a little bounce, reserved for settles that follow a gesture's
 * own momentum. Every {damping, stiffness, mass} below is derived from a
 * {dampingRatio ζ, response T} pair via the standard second-order-system
 * formulas (mass = 1 unless noted):
 *   ω0 (angular frequency) = 2π / response
 *   stiffness = mass · ω0²
 *   damping   = 2 · dampingRatio · mass · ω0
 * Self-check: ζ = damping / (2·sqrt(stiffness·mass)).
 */
export const springs = {
  // Discrete, non-momentum press feedback (button/chip/icon/list-row
  // press-in scale) — critically damped per §4's default, ζ≈1.0,
  // response 0.25s. damping=50, stiffness=632, mass=1.
  tap: {
    damping: 50,
    stiffness: 632,
    mass: 1,
  },
  // A gesture-release settle that travels (SlidingTabs' swipe commit) —
  // matches Apple's own "Move/reposition" row exactly (ζ=1.0, response
  // 0.4s), so a translateX settle following a flick still doesn't overshoot
  // — bounce is reserved for rotation/drawer content, not simple travel.
  // damping=31, stiffness=247, mass=1.
  reposition: {
    damping: 31,
    stiffness: 247,
    mass: 1,
  },
  // Snappy spring for touch buttons, chips, icons, and micro-interactions.
  // ζ≈0.65 — bouncier than §4's ζ=1.0 default for non-momentum feedback;
  // left numerically unchanged rather than "corrected" because it's used
  // across ~8 files and retuning a shipped, widely-used value with no
  // on-device verification available is a real regression risk, not
  // something to guess at. New non-momentum press feedback should use
  // `tap` above instead of this.
  snappy: {
    damping: 18,
    stiffness: 240,
    mass: 0.8,
  },
  // Smooth bouncy spring for popovers, badges, star bursts, and checkmarks.
  // ζ≈0.47 — bouncier than §4's own ζ≈0.8 momentum-bounce ceiling; some of
  // these call sites (e.g. a badge just appearing) aren't obviously
  // momentum-driven either. Left unchanged for the same reason as `snappy`
  // — a real tension with the skill's default, flagged rather than
  // silently "fixed" outside a verifiable on-device pass.
  bouncy: {
    damping: 12,
    stiffness: 180,
    mass: 0.9,
  },
  // Drawer/sheet spring — matches Apple's own "Drawer / sheet" row exactly
  // (ζ=0.8, response 0.3s), the textbook momentum-bounce case: a sheet
  // being dragged and released genuinely carries the gesture's momentum.
  // damping=33, stiffness=439, mass=1. Previously named the same but tuned
  // to ζ≈0.95 with zero call sites anywhere in the app — repurposed here
  // rather than left dead, now driving CompanyResultSheet's expand/collapse
  // settle.
  gentle: {
    damping: 33,
    stiffness: 439,
    mass: 1,
  },
  // Responsive slider/needle spring for gauges and dynamic dials. Not a
  // discrete user gesture — a live-data display animation — so out of
  // scope for §4's press/gesture guidance. Left unchanged.
  gauge: {
    damping: 16,
    stiffness: 120,
    mass: 0.9,
  },
  // High-stiffness, quickly-settling spring for tiny overshoot bounces (tab
  // icons, badges) that must never visibly linger or oscillate. Single
  // call site, not gesture-driven — left unchanged.
  quick: {
    damping: 16,
    stiffness: 420,
    mass: 0.5,
  },
} as const;

/**
 * Haptics helper that safely executes without throwing on web or unsupported devices.
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'light') {
  if (Platform.OS === 'web' || !useQolStore.getState().hapticsEnabled) return;
  try {
    switch (type) {
      case 'light':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'selection':
        Haptics.selectionAsync();
        break;
      case 'success':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // Graceful fallback if haptics unavailable
  }
}

const CATEGORY_HAPTIC: Record<SoundCategory, Parameters<typeof triggerHaptic>[0]> = {
  primary: 'medium',
  secondary: 'light',
  destructive: 'warning',
  selection: 'selection',
  navigation: 'light',
  success: 'success',
  error: 'error',
};

/**
 * Combined tap feedback (haptic + sound) for a given interaction category.
 * Prefer this over calling triggerHaptic directly for anything user-facing —
 * it keeps every button's haptic and sound in sync with its category.
 */
export function triggerFeedback(category: SoundCategory) {
  triggerHaptic(CATEGORY_HAPTIC[category]);
  if (useQolStore.getState().soundsEnabled) playSound(category);
}
