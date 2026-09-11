import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useQolStore } from '@/store/useQolStore';

// Merges the OS-level "reduce motion" accessibility setting with this app's
// own manual Settings toggle — either one being on means reduced. Replaces
// the previous scattered `useQolStore((s) => s.reducedMotion)` reads, which
// only honored the in-app toggle and never checked the OS setting at all.
//
// Fails open (starts/stays "not reduced") if the OS query rejects or the
// listener never fires — matching the app's existing default experience
// rather than silently switching everyone to reduced motion on an API
// hiccup. There's no RN-exposed equivalent of `prefers-reduced-transparency`
// on either platform, so that half of the skill's reduced-motion guidance
// has no OS signal to merge in here — the manual toggle remains the only
// lever for it, same as today.
export function useReducedMotion(): boolean {
  const manualToggle = useQolStore((state) => state.reducedMotion);
  const [osReducedMotion, setOsReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setOsReducedMotion(enabled);
      })
      .catch(() => {
        // Fail open — leave osReducedMotion false.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return manualToggle || osReducedMotion;
}
