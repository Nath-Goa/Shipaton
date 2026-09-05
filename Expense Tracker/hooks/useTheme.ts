import { useMemo } from 'react';

import { useColorScheme } from '@/components/useColorScheme';
import { paletteFor, type Palette } from '@/constants/theme';
import { useSettingsStore } from '@/store/useSettingsStore';

// paletteFor is memoized, so `colors` is already reference-stable for a
// given scheme+accent; memoizing the wrapper keeps the hook's whole return
// stable too, for the components that pass it around rather than
// destructuring it.
export function useTheme(): { scheme: 'light' | 'dark'; colors: Palette } {
  const mode = useSettingsStore((s) => s.themeMode);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const systemScheme = useColorScheme();
  const scheme: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = paletteFor(scheme, accentColor);
  return useMemo(() => ({ scheme, colors }), [scheme, colors]);
}
