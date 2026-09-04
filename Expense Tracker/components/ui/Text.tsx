import { forwardRef } from 'react';
import { StyleSheet, Text as RNText, type Text as RNTextInstance, type TextProps } from 'react-native';

import { useTypography } from '@/hooks/useTypography';

// Drop-in replacement for react-native's own `Text` — every screen imports
// this instead (see the codebase-wide import swap done alongside this
// file) so the font/text-size settings (Settings › Learning Environment)
// apply everywhere, not just the handful of screens that already used
// AppText. A screen's own explicit fontSize/lineHeight/fontWeight keep
// working exactly as before; this only adds the family override (when the
// user picked a non-system font) and multiplies the existing size by the
// user's text-scale — it never invents a font size where none was set.
function isBoldWeight(fontWeight: unknown): boolean {
  if (fontWeight === 'bold') return true;
  if (typeof fontWeight === 'number') return fontWeight >= 600;
  if (typeof fontWeight === 'string') {
    const n = parseInt(fontWeight, 10);
    return !Number.isNaN(n) && n >= 600;
  }
  return false;
}

export const Text = forwardRef<RNTextInstance, TextProps>(function Text({ style, ...rest }, ref) {
  const { regular, bold, scale } = useTypography();
  const flat = StyleSheet.flatten(style) ?? {};
  const family = isBoldWeight(flat.fontWeight) ? bold : regular;

  const override: { fontFamily?: string; fontWeight?: undefined; fontSize?: number; lineHeight?: number } = {};
  if (family) {
    // A custom TTF family already bakes in its own weight — letting the OS
    // also apply fontWeight on top of it produces inconsistent/faux-bold
    // rendering, so it's cleared whenever a family override is in play.
    override.fontFamily = family;
    override.fontWeight = undefined;
  }
  if (scale !== 1) {
    if (typeof flat.fontSize === 'number') override.fontSize = flat.fontSize * scale;
    if (typeof flat.lineHeight === 'number') override.lineHeight = flat.lineHeight * scale;
  }

  return <RNText ref={ref} {...rest} style={[style, override]} />;
});
