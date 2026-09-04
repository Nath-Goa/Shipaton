import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { useTypography } from '@/hooks/useTypography';

// Typography-aware Text wrapper: applies the user's chosen font (Settings ›
// Learning Environment) and text-scale multiplier. Scoped to new screens
// only (course system, focus-session, records, etc.) — the ~150 pre-existing
// screens keep their own hardcoded StyleSheet text styles; see the plan's
// "fonts are not retrofitted app-wide" scoping note.
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
  const { regular, bold, scale } = useTypography();
  const base = VARIANT_BASE[variant];
  const fontFamily = base.bold ? bold : regular;

  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily,
          fontSize: base.fontSize * scale,
          lineHeight: base.lineHeight * scale,
          fontWeight: fontFamily ? undefined : base.bold ? '700' : '400',
          color: color ?? colors.text,
        },
        variant === 'label' && { textTransform: 'uppercase', letterSpacing: 0.5 },
        style,
      ]}>
      {children}
    </Text>
  );
}
