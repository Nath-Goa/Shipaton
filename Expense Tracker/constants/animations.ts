import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Production-grade spring configurations tailored for 60fps mobile UI interactions.
 */
export const springs = {
  // Snappy spring for touch buttons, chips, icons, and micro-interactions
  snappy: {
    damping: 18,
    stiffness: 240,
    mass: 0.8,
  },
  // Smooth bouncy spring for popovers, badges, star bursts, and checkmarks
  bouncy: {
    damping: 12,
    stiffness: 180,
    mass: 0.9,
  },
  // Gentle fluid spring for sheets, cards, tabs, and layout sliding transitions
  gentle: {
    damping: 24,
    stiffness: 160,
    mass: 1,
  },
  // Responsive slider/needle spring for gauges and dynamic dials
  gauge: {
    damping: 16,
    stiffness: 120,
    mass: 0.9,
  },
} as const;

/**
 * Haptics helper that safely executes without throwing on web or unsupported devices.
 */
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'light') {
  if (Platform.OS === 'web') return;
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
