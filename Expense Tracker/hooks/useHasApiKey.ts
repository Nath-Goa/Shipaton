import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { getApiKey } from '@/services/ai/apiKey';
import { useSettingsStore } from '@/store/useSettingsStore';

// Live-checks whether the currently selected AI provider has a key saved in
// SecureStore. `null` while the initial check is in flight. Re-checks on
// every focus, not just mount — React Navigation keeps tab screens mounted,
// so a key saved on the Settings screen wouldn't otherwise be picked up when
// navigating back to a screen that already rendered once.
export function useHasApiKey(): { hasKey: boolean | null; refresh: () => void } {
  const provider = useSettingsStore((s) => s.aiProvider);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const refresh = useCallback(() => {
    let alive = true;
    getApiKey(provider).then((key) => {
      if (alive) setHasKey(!!key);
    });
    return () => {
      alive = false;
    };
  }, [provider]);

  useFocusEffect(refresh);

  return { hasKey, refresh };
}
