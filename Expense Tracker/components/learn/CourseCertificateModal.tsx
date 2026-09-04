import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ShareCardModal, shareCardStyles } from '@/components/ui/ShareCardModal';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  courseTitle: string;
  stageLabel: string;
};

export function CourseCertificateModal({ visible, onClose, courseTitle, stageLabel }: Props) {
  const { colors } = useTheme();
  const dateLabel = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <ShareCardModal visible={visible} onClose={onClose} shareDialogTitle="Share your certificate">
      <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="ribbon" size={28} color={colors.accent} />
      </View>
      <Text style={[styles.brand, { color: colors.text3 }]}>COURSE COMPLETE</Text>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {courseTitle}
      </Text>
      <Text style={[styles.stage, { color: colors.text3 }]}>{stageLabel}</Text>
      <Text style={[styles.date, { color: colors.text2 }]}>{dateLabel}</Text>
      <Text style={[shareCardStyles.disclaimer, { color: colors.text3 }]}>Simulated learning progress — no real credential.</Text>
    </ShareCardModal>
  );
}

const styles = StyleSheet.create({
  iconBadge: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  brand: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm, letterSpacing: -0.3 },
  stage: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  date: { fontSize: 13, marginTop: spacing.md },
});
