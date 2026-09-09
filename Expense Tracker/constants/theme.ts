// Color tokens ported 1:1 from the reference web app's styles.css custom properties.
// Spacing/radius were bumped up one notch app-wide (from 12/16/20/28 and
// 12/18/24 respectively) to give every screen more breathing room — the app
// read as visually cramped since every Card/content padding traces back to
// these few tokens, so this one change reaches everywhere at once instead of
// a per-screen pass.
export const radius = {
  sm: 14,
  md: 20,
  lg: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export type Palette = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  text2: string;
  text3: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  onAccent: string;
};

export const lightPalette: Palette = {
  bg: '#f4f5fb',
  surface: '#ffffff',
  surface2: '#f8f8fd',
  border: '#e3e5f0',
  text: '#111322',
  text2: '#555d73',
  text3: '#8189a0',
  accent: '#6257e8',
  accentSoft: '#eeecff',
  danger: '#e5484d',
  dangerSoft: '#fdeceD',
  success: '#12805c',
  successSoft: '#e3f6ee',
  warning: '#b45309',
  onAccent: '#ffffff',
};

export const darkPalette: Palette = {
  bg: '#0a0b12',
  surface: '#141621',
  surface2: '#1b1e2c',
  border: '#292d3e',
  text: '#f4f4fa',
  text2: '#adb2c5',
  text3: '#7e859c',
  accent: '#9b91ff',
  accentSoft: '#28254f',
  danger: '#ff6369',
  dangerSoft: '#3a2026',
  success: '#3dd68c',
  successSoft: '#153229',
  warning: '#f5a524',
  onAccent: '#0d0f16',
};

export type AccentColor = 'purple' | 'red' | 'green' | 'blue' | 'orange' | 'yellow' | 'pink';

export const ACCENT_COLORS: AccentColor[] = ['purple', 'red', 'green', 'blue', 'orange', 'yellow', 'pink'];

export const ACCENT_LABELS: Record<AccentColor, string> = {
  purple: 'Purple',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  orange: 'Orange',
  yellow: 'Yellow',
  pink: 'Pink',
};

// Accent overrides layered on top of the light/dark base palette above —
// only accent + accentSoft change per color, everything else (bg, surface,
// text, semantic danger/success colors) stays the scheme's default. "purple"
// matches the app's original default accent exactly, so picking it changes
// nothing for existing installs.
const ACCENT_OVERRIDES: Record<AccentColor, { light: Pick<Palette, 'accent' | 'accentSoft'>; dark: Pick<Palette, 'accent' | 'accentSoft'> }> = {
  purple: {
    light: { accent: '#6257e8', accentSoft: '#eeecff' },
    dark: { accent: '#9b91ff', accentSoft: '#28254f' },
  },
  red: {
    light: { accent: '#e5484d', accentSoft: '#fdeceD' },
    dark: { accent: '#ff6369', accentSoft: '#3a2026' },
  },
  green: {
    light: { accent: '#12805c', accentSoft: '#e3f6ee' },
    dark: { accent: '#3dd68c', accentSoft: '#153229' },
  },
  blue: {
    light: { accent: '#2563eb', accentSoft: '#e8f0fe' },
    dark: { accent: '#5b9dff', accentSoft: '#16233d' },
  },
  orange: {
    light: { accent: '#ea580c', accentSoft: '#fff1e8' },
    dark: { accent: '#ff9152', accentSoft: '#3a2412' },
  },
  yellow: {
    light: { accent: '#a16207', accentSoft: '#fef9e0' },
    dark: { accent: '#f2c318', accentSoft: '#3a3010' },
  },
  pink: {
    light: { accent: '#db2777', accentSoft: '#fdf0f7' },
    dark: { accent: '#ff6fb1', accentSoft: '#3a1d2c' },
  },
};

// Memoized per scheme+accent, which is a tiny finite set. This is called by
// useTheme, which nearly every component in the app calls on every render —
// so the old unconditional spread both allocated a fresh palette hundreds of
// times per render pass and, more importantly, handed every caller a new
// `colors` object identity each time. That invalidated every useMemo and
// useCallback keyed on colors and defeated memoized children, turning a
// cheap object into app-wide re-render pressure. Same inputs must return the
// same reference.
const paletteCache = new Map<string, Palette>();

export function paletteFor(scheme: 'light' | 'dark', accentColor: AccentColor = 'purple'): Palette {
  const key = `${scheme}:${accentColor}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const base = scheme === 'dark' ? darkPalette : lightPalette;
  const palette = { ...base, ...ACCENT_OVERRIDES[accentColor][scheme] };
  paletteCache.set(key, palette);
  return palette;
}

export const shadow = {
  sm: {
    shadowColor: '#171B3A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#171B3A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;
