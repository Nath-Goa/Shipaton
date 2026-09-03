import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { triggerFeedback } from '@/constants/animations';
import { ACCENT_COLORS, ACCENT_LABELS, type AccentColor } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// The swatch shown per color is that color's own light-mode accent hex —
// stable regardless of the current scheme, so the picker reads the same in
// light or dark mode.
const SWATCH_HEX: Record<AccentColor, string> = {
  purple: '#5b5bd6',
  red: '#e5484d',
  green: '#12805c',
  blue: '#2563eb',
  orange: '#ea580c',
  yellow: '#a16207',
  pink: '#db2777',
};

type Props = {
  value: AccentColor;
  onChange: (color: AccentColor) => void;
};

export function AccentColorPicker({ value, onChange }: Props) {
  const { colors } = useTheme();

  function handleSelect(color: AccentColor) {
    if (color !== value) triggerFeedback('selection');
    onChange(color);
  }

  return (
    <View style={styles.row}>
      {ACCENT_COLORS.map((color) => {
        const active = color === value;
        return (
          <Pressable
            key={color}
            accessibilityLabel={ACCENT_LABELS[color]}
            hitSlop={6}
            onPress={() => handleSelect(color)}
            style={[
              styles.swatch,
              { backgroundColor: SWATCH_HEX[color] },
              active && { borderColor: colors.text, borderWidth: 2 },
            ]}>
            {active ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
