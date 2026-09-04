import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { triggerFeedback } from '@/constants/animations';
import { FONT_DESCRIPTIONS, FONT_FAMILY_BOLD, FONT_LABELS, FONT_OPTIONS, type FontOption } from '@/constants/fonts';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  value: FontOption;
  onChange: (font: FontOption) => void;
};

// Same select-a-card-with-a-checkmark interaction as AccentColorPicker, but
// each card previews the actual font instead of a color swatch.
export function FontPicker({ value, onChange }: Props) {
  const { colors } = useTheme();

  function handleSelect(font: FontOption) {
    if (font !== value) triggerFeedback('selection');
    onChange(font);
  }

  return (
    <View style={styles.grid}>
      {FONT_OPTIONS.map((font) => {
        const active = font === value;
        return (
          <Pressable
            key={font}
            onPress={() => handleSelect(font)}
            style={[
              styles.card,
              { backgroundColor: colors.surface2, borderColor: active ? colors.accent : colors.border },
              active && { borderWidth: 2 },
            ]}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: FONT_FAMILY_BOLD[font] }]}>Aa</Text>
              {active ? <Ionicons name="checkmark-circle" size={16} color={colors.accent} /> : null}
            </View>
            <Text style={[styles.cardLabel, { color: colors.text }]}>{FONT_LABELS[font]}</Text>
            <Text style={[styles.cardDescription, { color: colors.text3 }]} numberOfLines={2}>
              {FONT_DESCRIPTIONS[font]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 20 },
  cardLabel: { fontSize: 13.5, fontWeight: '700', marginTop: 4 },
  cardDescription: { fontSize: 11, lineHeight: 14, marginTop: 2 },
});
