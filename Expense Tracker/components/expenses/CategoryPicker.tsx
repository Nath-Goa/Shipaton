import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui/Chip';
import { CATEGORIES, type CategoryId } from '@/constants/categories';
import { spacing } from '@/constants/theme';

type Props = {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
};

export function CategoryPicker({ value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {CATEGORIES.map((c) => (
        <Chip key={c.id} label={`${c.icon} ${c.label}`} active={value === c.id} onPress={() => onChange(c.id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
});
