import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import {
  getAllQuotes,
  getMarketDataStatus,
  resetMarketCache,
  type MarketDataStatus,
} from '@/services/marketData/marketData';
import { usePredictorStore } from '@/store/usePredictorStore';

const POLL_MS = 1500;

function timeAgo(at: number | null): string {
  if (!at) return 'never';
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

// Live prices failing on a real device was previously invisible: every
// network error was swallowed so the app could fall back to mock data
// silently, which is right for the UI but left "why is it still showing
// fake prices?" impossible to answer without a debugger. This reports what
// the market-data layer is actually doing, straight from the device.
export function MarketDataStatusCard() {
  const { colors } = useTheme();
  const health = usePredictorStore((s) => s.health);
  const resolved = usePredictorStore((s) => s.resolved);
  const resetPredictor = usePredictorStore((s) => s.resetModel);
  // Recomputed only when a call actually resolves; accuracy() reads the
  // store directly, so subscribing to `resolved` is what keeps this live.
  const record = useMemo(() => usePredictorStore.getState().accuracy(), [resolved]);
  const [status, setStatus] = useState<MarketDataStatus>(() => getMarketDataStatus());

  useEffect(() => {
    const timer = setInterval(() => setStatus(getMarketDataStatus()), POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const live = status.symbolsWithLiveQuote > 0 || status.symbolsWithLiveBars > 0;

  function retryNow() {
    resetMarketCache();
    // Reading every quote is what actually queues the refetches.
    getAllQuotes();
    setStatus(getMarketDataStatus());
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>Status</Text>
        <Text style={[styles.value, { color: live ? colors.success : colors.danger }]}>
          {live ? 'Live data' : 'Simulated prices'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>Source</Text>
        <Text style={[styles.value, { color: colors.text }]}>{status.provider}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>Live prices</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {status.symbolsWithLiveQuote}/{status.totalSymbols}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>Live history</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {status.symbolsWithLiveBars}/{status.totalSymbols}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>Requests</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {status.requestCount} sent · {status.failureCount} failed
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>In flight</Text>
        <Text style={[styles.value, { color: colors.text }]}>
          {status.pendingRequests} · {status.backingOff} waiting to retry
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { color: colors.text3 }]}>Last success</Text>
        <Text style={[styles.value, { color: colors.text }]}>{timeAgo(status.lastSuccessAt)}</Text>
      </View>

      {status.lastError ? (
        <View>
          <Text style={[styles.label, { color: colors.text3 }]}>Last error ({timeAgo(status.lastErrorAt)})</Text>
          <Text style={[styles.errorText, { color: colors.danger }]}>{status.lastError}</Text>
        </View>
      ) : null}

      <Button label="Retry live prices now" variant="ghost" onPress={retryNow} />

      <View style={[styles.predictorBlock, { borderTopColor: colors.border }]}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text3 }]}>Predictor</Text>
          <Text
            style={[
              styles.value,
              { color: health?.status === 'degraded' ? colors.danger : colors.success },
            ]}>
            {health?.status === 'degraded' ? 'Offline (failed self-test)' : 'OK'}
          </Text>
        </View>
        {health ? (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text3 }]}>Self-test</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {(health.accuracy * 100).toFixed(1)}% vs {(health.baselineAccuracy * 100).toFixed(1)}% shipped
            </Text>
          </View>
        ) : null}
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text3 }]}>Its own record</Text>
          <Text style={[styles.value, { color: colors.text }]}>
            {record.resolved === 0
              ? 'no calls resolved yet'
              : `${record.correct}/${record.resolved} correct (${(record.accuracy * 100).toFixed(0)}%)`}
          </Text>
        </View>
        <Button label="Reset predictor to shipped model" variant="ghost" onPress={resetPredictor} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  label: { fontSize: 12, letterSpacing: trackingFor(12), fontWeight: '600' },
  value: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  errorText: { fontSize: 12, letterSpacing: trackingFor(12), lineHeight: 16, marginTop: 2 },
  predictorBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
});
