import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { Button } from '@/components/ui/Button';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/store/useToastStore';

// Structural copy of components/portfolio/ResultsCardModal.tsx — same
// backdrop/entrance-animation split and ViewShot + expo-sharing flow.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Stat = { label: string; value: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  stats: Stat[];
};

export function RecordsCardModal({ visible, onClose, stats }: Props) {
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
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your records' });
    } catch {
      showToast('Could not create the share image.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <AnimatedPressable entering={FadeIn.duration(180)} style={styles.backdrop} onPress={onClose}>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.wrap}>
          <Pressable onPress={(e: any) => e.stopPropagation()}>
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.brand, { color: colors.text3 }]}>PERSONAL RECORDS</Text>
              <View style={styles.grid}>
                {stats.map((s) => (
                  <View key={s.label} style={styles.stat}>
                    <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.text3 }]}>{s.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.disclaimer, { color: colors.text3 }]}>Simulated mock-trading progress.</Text>
            </ViewShot>

            <View style={styles.actions}>
              <Button label="Share" fullWidth onPress={handleShare} loading={sharing} />
              <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
            </View>
          </Pressable>
        </Animated.View>
      </AnimatedPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  wrap: { width: '100%', maxWidth: 360 },
  card: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  brand: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center' },
  stat: { alignItems: 'center', width: 96 },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2, textAlign: 'center' },
  disclaimer: { fontSize: 10, marginTop: spacing.lg, textAlign: 'center' },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
