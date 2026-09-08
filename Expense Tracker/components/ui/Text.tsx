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

// The device's own "large text" accessibility setting multiplies rendered
// font size on top of everything below, and it's uncapped — Android alone
// can push it well past 2x. This app's fixed-width chrome (buttons, the tab
// bar, the top bar, stat tiles) was built and eyeballed against the app's
// own biggest in-app text-scale option (1.3, see TEXT_SCALE_OPTIONS in
// constants/fonts.ts), never against an arbitrary OS multiplier. Left
// uncapped, a short label like "Portfolio" or "Watchlist" gets measured and
// laid out at one width, then the OS draws wider glyphs into that same box
// — and because most of these labels were never given a way to wrap (see
// the flexShrink additions this shipped alongside), the tail gets clipped
// with no visible "…". Capping at the same 1.3 the in-app setting already
// tops out at keeps every screen inside the range this app is actually
// tested at, while leaving the in-app scale itself — a separate,
// deliberate multiplicative axis — untouched.
const MAX_FONT_SCALE_MULTIPLIER = 1.3;

export const Text = forwardRef<RNTextInstance, TextProps>(function Text(
  { style, maxFontSizeMultiplier, ...rest },
  ref
) {
  const { regular, bold, scale } = useTypography();
  const fontScaleCap = maxFontSizeMultiplier ?? MAX_FONT_SCALE_MULTIPLIER;

  // Fast path for the default settings (system font, 1x scale), which is
  // what most renders use: with no family to apply and no scale to
  // multiply, the override below is always empty, so flattening the style
  // and rebuilding the array is pure waste — and this component wraps every
  // piece of text in the app, hundreds of nodes per screen per render.
  // Passing `style` straight through also preserves its identity, which
  // keeps React Native's own style diffing cheap.
  if (!regular && !bold && scale === 1) {
    return <RNText ref={ref} {...rest} maxFontSizeMultiplier={fontScaleCap} style={style} />;
  }

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

  return <RNText ref={ref} {...rest} maxFontSizeMultiplier={fontScaleCap} style={[style, override]} />;
});
