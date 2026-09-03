// Color tokens ported 1:1 from the reference web app's styles.css custom properties.
export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
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
  bg: '#f5f6fa',
  surface: '#ffffff',
  surface2: '#f8f9fc',
  border: '#e6e8ef',
  text: '#12141c',
  text2: '#5a6072',
  text3: '#8b91a3',
  accent: '#5b5bd6',
  accentSoft: '#eeeeff',
  danger: '#e5484d',
  dangerSoft: '#fdeceD',
  success: '#12805c',
  successSoft: '#e3f6ee',
  warning: '#b45309',
  onAccent: '#ffffff',
};

export const darkPalette: Palette = {
  bg: '#0d0f16',
  surface: '#151823',
  surface2: '#1b1f2c',
  border: '#262b3a',
  text: '#eef0f6',
  text2: '#a2a8ba',
  text3: '#767d92',
  accent: '#8b8bf5',
  accentSoft: '#23264a',
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
    light: { accent: '#5b5bd6', accentSoft: '#eeeeff' },
    dark: { accent: '#8b8bf5', accentSoft: '#23264a' },
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

export function paletteFor(scheme: 'light' | 'dark', accentColor: AccentColor = 'purple'): Palette {
  const base = scheme === 'dark' ? darkPalette : lightPalette;
  const override = ACCENT_OVERRIDES[accentColor][scheme];
  return { ...base, ...override };
}

export const shadow = {
  sm: {
    shadowColor: '#10142866',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#10142866',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;
