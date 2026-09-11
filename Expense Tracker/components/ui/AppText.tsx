import type { ReactNode } from 'react';
import type { StyleProp, TextProps, TextStyle } from 'react-native';

import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

import { Text } from './Text';

// Convenience wrapper over the app-wide `Text` (see Text.tsx for the actual
// font/text-scale application, which every screen gets automatically): just
// adds named size/weight variants and a theme-aware default color, so
// callers don't have to repeat fontSize/lineHeight/fontWeight per screen.
type Variant = 'title' | 'subtitle' | 'body' | 'caption' | 'label';

const VARIANT_BASE: Record<Variant, { fontSize: number; lineHeight: number; bold?: boolean }> = {
  title: { fontSize: 24, lineHeight: 30, bold: true },
  subtitle: { fontSize: 16, lineHeight: 22, bold: true },
  body: { fontSize: 14.5, lineHeight: 21 },
  caption: { fontSize: 12.5, lineHeight: 17 },
  label: { fontSize: 11.5, lineHeight: 15, bold: true },
};

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  children: ReactNode;
  style?: StyleProp<TextStyle>;
};

export function AppText({ variant = 'body', color, style, children, ...rest }: Props) {
  const { colors } = useTheme();
  const base = VARIANT_BASE[variant];
  // Calibration check (see constants/typography.ts): trackingFor(11.5,
  // {uppercase:true}) === 0.5, exactly the value `label` hardcoded before
  // this was formula-driven — the other 4 variants previously had no
  // tracking at all.
  const letterSpacing = trackingFor(base.fontSize, { uppercase: variant === 'label' });

  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: base.fontSize,
          lineHeight: base.lineHeight,
          fontWeight: base.bold ? '700' : '400',
          color: color ?? colors.text,
          letterSpacing,
        },
        variant === 'label' && { textTransform: 'uppercase' },
        style,
      ]}>
      {children}
    </Text>
  );
}
