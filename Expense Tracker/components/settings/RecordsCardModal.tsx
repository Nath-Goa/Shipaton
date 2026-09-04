import { StyleSheet, View } from 'react-native';

import { ShareCardModal, shareCardStyles } from '@/components/ui/ShareCardModal';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Stat = { label: string; value: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  stats: Stat[];
};

export function RecordsCardModal({ visible, onClose, stats }: Props) {
  const { colors } = useTheme();

  return (
    <ShareCardModal visible={visible} onClose={onClose} shareDialogTitle="Share your records">
      <Text style={[styles.brand, { color: colors.text3 }]}>PERSONAL RECORDS</Text>
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.statLabel, { color: colors.text3 }]}>{s.label}</Text>
          </View>
        ))}
      </View>
      <Text style={[shareCardStyles.disclaimer, { color: colors.text3 }]}>Simulated mock-trading progress.</Text>
    </ShareCardModal>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center' },
  stat: { alignItems: 'center', width: 96 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2, textAlign: 'center' },
});
