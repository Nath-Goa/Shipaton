import { StyleSheet, View } from 'react-native';

import { ShareCardModal, shareCardStyles } from '@/components/ui/ShareCardModal';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { money, signedMoney, signedPct } from '@/utils/money';

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
  const pnlColor = allTimePnl >= 0 ? colors.success : colors.danger;

  return (
    <ShareCardModal visible={visible} onClose={onClose} shareDialogTitle="Share your results">
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
      <Text style={[shareCardStyles.disclaimer, { color: colors.text3 }]}>Simulated paper trading — no real money involved.</Text>
    </ShareCardModal>
  );
}

const styles = StyleSheet.create({
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
});
