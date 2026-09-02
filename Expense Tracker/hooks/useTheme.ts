import { useColorScheme } from '@/components/useColorScheme';
import { paletteFor, type Palette } from '@/constants/theme';
import { useSettingsStore } from '@/store/useSettingsStore';

export function useTheme(): { scheme: 'light' | 'dark'; colors: Palette } {
  const mode = useSettingsStore((s) => s.themeMode);
  const systemScheme = useColorScheme();
  const scheme: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  return { scheme, colors: paletteFor(scheme) };
}
