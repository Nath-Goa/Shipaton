import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { Button } from '@/components/ui/Button';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/store/useToastStore';
import { money, signedMoney, signedPct } from '@/utils/money';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  visible: boolean;
  onClose: () => void;
  name: string;
  netWorth: number;
  allTimePnl: number;
  allTimePnlPct: number;
  holdingsCount: number;
  dividendTotal: number;
};

export function ResultsCardModal({
  visible,
  onClose,
  name,
  netWorth,
  allTimePnl,
  allTimePnlPct,
  holdingsCount,
  dividendTotal,
}: Props) {
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
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your results' });
    } catch {
      showToast('Could not create the share image.');
    } finally {
      setSharing(false);
    }
  }

  const pnlColor = allTimePnl >= 0 ? colors.success : colors.danger;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <AnimatedPressable entering={FadeIn.duration(180)} style={styles.backdrop} onPress={onClose}>
        <AnimatedPressable
          entering={FadeInDown.springify().damping(18)}
          style={styles.wrap}
          onPress={(e: any) => e.stopPropagation()}>
          <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.brand, { color: colors.text3 }]}>📈 Stock Market Predictor & Tutor</Text>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.netWorth, { color: colors.text }]}>{money(netWorth)}</Text>
            <Text style={[styles.pnl, { color: pnlColor }]}>
              {signedMoney(allTimePnl)} ({signedPct(allTimePnlPct)}) all-time
            </Text>
            <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
              <View style={styles.stat}>
                <Text style={[styles.statLabel, { color: colors.text3 }]}>Positions</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>{holdingsCount}</Text>
              </View>
              {dividendTotal > 0 ? (
                <View style={styles.stat}>
                  <Text style={[styles.statLabel, { color: colors.text3 }]}>Dividends</Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>{money(dividendTotal)}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.disclaimer, { color: colors.text3 }]}>Simulated paper trading — no real money involved.</Text>
          </ViewShot>

          <View style={styles.actions}>
            <Button label="Share" fullWidth onPress={handleShare} loading={sharing} />
            <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
          </View>
        </AnimatedPressable>
      </AnimatedPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  wrap: { width: '100%', maxWidth: 360 },
  card: { borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center' },
  brand: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.lg },
  name: { fontSize: 14, fontWeight: '600' },
  netWorth: { fontSize: 34, fontWeight: '700', marginTop: spacing.xs, letterSpacing: -0.6 },
  pnl: { fontSize: 15, fontWeight: '700', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    width: '100%',
    justifyContent: 'center',
  },
  stat: { alignItems: 'center' },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  disclaimer: { fontSize: 10, marginTop: spacing.lg, textAlign: 'center' },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
