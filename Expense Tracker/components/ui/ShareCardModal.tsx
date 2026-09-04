import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { Button } from '@/components/ui/Button';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/store/useToastStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  shareDialogTitle: string;
  children: ReactNode;
};

// Shared shell for every "share as image" card (portfolio results, personal
// records, course certificates): the backdrop/entrance split, the
// ViewShot + expo-sharing capture flow, and the Share/Close buttons.
// Callers only provide the card's own content as children — see
// ResultsCardModal / RecordsCardModal / CourseCertificateModal.
export function ShareCardModal({ visible, onClose, shareDialogTitle, children }: Props) {
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
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: shareDialogTitle });
    } catch {
      showToast('Could not create the share image.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        {/* Entrance animation on this plain, non-touchable Animated.View —
            never on a Pressable. A Reanimated `entering=` view can drop the
            first tap or two while it's still settling, so the dismiss-on-tap
            area is a separate absolute-fill Pressable instead. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.wrap}>
          <Pressable onPress={(e: any) => e.stopPropagation()}>
            <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={[styles.card, { backgroundColor: colors.surface }]}>
              {children}
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

// Shared by every card's own content — export so callers don't redeclare it.
export const shareCardStyles = StyleSheet.create({
  disclaimer: { fontSize: 10, marginTop: spacing.lg, textAlign: 'center' },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  wrap: { width: '100%', maxWidth: 360 },
  card: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
