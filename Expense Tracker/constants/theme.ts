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

export function paletteFor(scheme: 'light' | 'dark'): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
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
