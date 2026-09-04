import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/store/useToastStore';

// Structural copy of components/portfolio/ResultsCardModal.tsx — same
// backdrop/entrance-animation split (a Reanimated `entering=` view must
// never also carry the Pressable catching taps, or the first tap or two can
// drop) and the same ViewShot + expo-sharing share-as-image flow.

type Props = {
  visible: boolean;
  onClose: () => void;
  courseTitle: string;
  stageLabel: string;
};

export function CourseCertificateModal({ visible, onClose, courseTitle, stageLabel }: Props) {
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const cardRef = useRef<ViewShotRef>(null);
  const [sharing, setSharing] = useState(false);

  async function handleShare() {
    if (sharing || !cardRef.current) return;
    setSharing(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        showToast('Sharing is not available on this device.');
        return;
      }
      const uri = await cardRef.current.capture();
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your certificate' });
    } catch {
      showToast('Could not create the share image.');
    } finally {
      setSharing(false);
    }
  }

  const dateLabel = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.wrap}>
          <Pressable onPress={(e: any) => e.stopPropagation()}>
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={[styles.card, { backgroundColor: colors.surface }]}>
              <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="ribbon" size={28} color={colors.accent} />
              </View>
              <Text style={[styles.brand, { color: colors.text3 }]}>COURSE COMPLETE</Text>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                {courseTitle}
              </Text>
              <Text style={[styles.stage, { color: colors.text3 }]}>{stageLabel}</Text>
              <Text style={[styles.date, { color: colors.text2 }]}>{dateLabel}</Text>
              <Text style={[styles.disclaimer, { color: colors.text3 }]}>Simulated learning progress — no real credential.</Text>
            </ViewShot>

            <View style={styles.actions}>
              <Button label="Share" fullWidth onPress={handleShare} loading={sharing} />
              <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  wrap: { width: '100%', maxWidth: 360 },
  card: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  iconBadge: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  brand: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm, letterSpacing: -0.3 },
  stage: { fontSize: 12.5, fontWeight: '600', marginTop: 4 },
  date: { fontSize: 13, marginTop: spacing.md },
  disclaimer: { fontSize: 10, marginTop: spacing.lg, textAlign: 'center' },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
