import {
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { Baloo2_600SemiBold, Baloo2_700Bold } from '@expo-google-fonts/baloo-2';
import { Lora_400Regular, Lora_700Bold } from '@expo-google-fonts/lora';

// Mirrors constants/theme.ts's AccentColor pattern: a fixed option set, a
// labels map, and a lookup used everywhere the option is consumed.
export type FontOption = 'system' | 'friendly' | 'reading' | 'accessible';

export const FONT_OPTIONS: FontOption[] = ['system', 'friendly', 'reading', 'accessible'];

export const FONT_LABELS: Record<FontOption, string> = {
  system: 'System',
  friendly: 'Friendly',
  reading: 'Reading',
  accessible: 'Accessible',
};

export const FONT_DESCRIPTIONS: Record<FontOption, string> = {
  system: 'Your device’s default font.',
  friendly: 'Rounded and approachable — a warm, beginner-friendly feel.',
  reading: 'A serif built for long-form reading, used in lesson content.',
  accessible: 'Atkinson Hyperlegible — designed for maximum legibility.',
};

// undefined = fall through to the platform default font.
export const FONT_FAMILY_REGULAR: Record<FontOption, string | undefined> = {
  system: undefined,
  friendly: 'Baloo2_600SemiBold',
  reading: 'Lora_400Regular',
  accessible: 'AtkinsonHyperlegible_400Regular',
};

export const FONT_FAMILY_BOLD: Record<FontOption, string | undefined> = {
  system: undefined,
  friendly: 'Baloo2_700Bold',
  reading: 'Lora_700Bold',
  accessible: 'AtkinsonHyperlegible_700Bold',
};

// Loaded once at app startup via useFonts() in app/_layout.tsx.
export const CUSTOM_FONTS_TO_LOAD = {
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Lora_400Regular,
  Lora_700Bold,
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
};

export type TextScale = 0.9 | 1 | 1.15 | 1.3;

export const TEXT_SCALE_OPTIONS: { value: TextScale; label: string }[] = [
  { value: 0.9, label: 'Small' },
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'XL' },
];
