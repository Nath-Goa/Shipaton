import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { PRETRAINED_METRICS } from '@/services/predictor/pretrained';
import { predict } from '@/services/predictor/predictor';
import { cachedSentiment, scanSymbolNews } from '@/services/predictor/startupScan';
import { usePredictorStore } from '@/store/usePredictorStore';
import type { NewsSentiment, Prediction } from '@/types/prediction';

// Presents the model's call — and, just as importantly, its limits.
//
// The honesty rules here are deliberate, not decoration: the headline number
// is a probability rather than a verdict, "no clear signal" is a first-class
// outcome shown whenever the model is under its confidence threshold, and
// the measured out-of-sample accuracy sits directly beside the call. A
// beginner reading this should come away knowing the edge is small and real,
// not that the app can see the future.

type Props = { symbol: string };

export function PredictionCard({ symbol }: Props) {
  const { colors } = useTheme();
  const model = usePredictorStore((s) => s.model);
  const health = usePredictorStore((s) => s.health);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [news, setNews] = useState<NewsSentiment | null>(() => cachedSentiment(symbol));

  const recompute = useCallback(
    (sentiment: NewsSentiment | null) => {
      setPrediction(predict({ symbol, model, news: sentiment }));
    },
    [symbol, model]
  );

  useEffect(() => {
    const cached = cachedSentiment(symbol);
    setNews(cached);
    recompute(cached);
  }, [symbol, recompute]);

  useEffect(() => {
    // Headlines refine an already-rendered call rather than gating it, so a
    // slow or failed news fetch never leaves this card empty.
    let cancelled = false;
    if (cachedSentiment(symbol)) return;
    scanSymbolNews(symbol).then((sentiment) => {
      if (cancelled || !sentiment) return;
      setNews(sentiment);
      recompute(sentiment);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, recompute]);

  // A failed integrity check takes precedence over everything: if on-device
  // learning has drifted the weights away from their measured behaviour, the
  // right move is to say so and show nothing, not to serve a number that
  // looks identical to a good one.
  if (health?.status === 'degraded') {
    return (
      <Card>
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]}>Price outlook</Text>
          <PillBadge label="Offline" color={colors.danger} backgroundColor={colors.dangerSoft} />
        </View>
        <Text style={[styles.body, { color: colors.text2 }]}>
          Predictions are switched off on this device. On startup the model re-scores{' '}
          {health.samples} samples of real market history it was never trained on, and this run came back{' '}
          {(health.drift * 100).toFixed(1)} points below the accuracy it shipped with — meaning the
          learning-from-your-usage step has degraded it rather than improved it.
        </Text>
        <Text style={[styles.footnote, { color: colors.text3, marginTop: spacing.sm }]}>
          Nothing you did caused this, and nothing else in the app is affected. You can restore the original
          shipped model from Settings › Market data.
        </Text>
      </Card>
    );
  }

  if (!prediction) {
    return (
      <Card>
        <Text style={[styles.title, { color: colors.text }]}>Price outlook</Text>
        <Text style={[styles.body, { color: colors.text2 }]}>
          Not enough price history for this stock yet — the model needs about a year of daily data before it
          will make a call.
        </Text>
      </Card>
    );
  }

  const unclear = prediction.direction === 'unclear';
  const up = prediction.direction === 'up';
  const tone = unclear ? colors.text2 : up ? colors.success : colors.danger;
  const toneSoft = unclear ? colors.surface2 : up ? colors.successSoft : colors.dangerSoft;
  const probability = Math.round(prediction.probabilityUp * 100);
  const heroLabel = unclear ? 'Too close to call' : up ? 'Leaning up' : 'Leaning down';
  const heroIcon = unclear ? 'remove-outline' : up ? 'trending-up' : 'trending-down';
  const heroSub = unclear
    ? "The signals don't line up enough for a confident call right now."
    : `The model leans toward ${symbol} closing ${up ? 'higher' : 'lower'} over the next ${prediction.horizonDays} trading days.`;

  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <Card>
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]}>Price outlook</Text>
          <PillBadge label={`${prediction.horizonDays}-day model`} color={colors.text3} backgroundColor={colors.surface2} />
        </View>

        {/* The direction call is the actual answer to "what does this card
            say" — leads with a plain-English label instead of a raw
            percentage, since that's what was unclear to most readers. */}
        <View style={styles.heroRow}>
          <View style={[styles.heroIconWrap, { backgroundColor: toneSoft }]}>
            <Ionicons name={heroIcon} size={22} color={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroLabel, { color: tone }]}>{heroLabel}</Text>
            <Text style={[styles.heroSub, { color: colors.text2 }]}>{heroSub}</Text>
          </View>
          <View style={styles.heroPctWrap}>
            <Text style={[styles.heroPct, { color: tone }]}>{probability}%</Text>
            <Text style={[styles.heroPctLabel, { color: colors.text3 }]}>chance up</Text>
          </View>
        </View>

        {unclear ? (
          <Text style={[styles.body, { color: colors.text2 }]}>
            This is close enough to a coin flip that the model won&apos;t call it. That&apos;s the honest
            answer most of the time — it only commits when the signals line up.
          </Text>
        ) : null}

        {/* Directly answers "why does every stock show a similar number?" —
            a real question people asked after seeing this card on a few
            different stocks, not an edge case worth burying in a footnote. */}
        <View style={[styles.infoBanner, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.text3} />
          <Text style={[styles.infoText, { color: colors.text3 }]}>
            Numbers usually cluster close to 50% across different stocks — that&apos;s expected, not a bug.
            Predicting short-term price moves is genuinely hard, so even a real, backtested model only has a
            small, honest edge, never a big one.
          </Text>
        </View>

        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.text3 }]}>What&apos;s driving this</Text>
          {prediction.drivers.map((driver) => {
            const pushesUp = driver.contribution > 0;
            return (
              <View key={driver.feature} style={styles.driverRow}>
                <Ionicons
                  name={pushesUp ? 'arrow-up' : 'arrow-down'}
                  size={13}
                  color={pushesUp ? colors.success : colors.danger}
                />
                <Text style={[styles.driverLabel, { color: colors.text2 }]}>{driver.label}</Text>
              </View>
            );
          })}
        </View>

        {news && news.headlineCount > 0 ? (
          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.newsHead}>
              <Text style={[styles.sectionLabel, { color: colors.text3 }]}>
                Headlines ({news.scoredCount} of {news.headlineCount} scored)
              </Text>
              <Text
                style={[
                  styles.newsTone,
                  {
                    color:
                      news.label === 'positive'
                        ? colors.success
                        : news.label === 'negative'
                          ? colors.danger
                          : colors.text3,
                  },
                ]}>
                {news.label}
              </Text>
            </View>
            {news.topHeadlines.map((headline) => (
              <Text key={headline.title} style={[styles.headline, { color: colors.text2 }]} numberOfLines={2}>
                • {headline.title}
              </Text>
            ))}
            {prediction.newsAdjustment !== 0 ? (
              <Text style={[styles.footnote, { color: colors.text3 }]}>
                Headlines moved this call by {(prediction.newsAdjustment * 100).toFixed(1)} points, from{' '}
                {Math.round(prediction.baseProbability * 100)}%. News is capped at a small nudge — only the
                price model is backtested.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.footnote, { color: colors.text3 }]}>
            Measured on {PRETRAINED_METRICS.testSamples.toLocaleString()} predictions over a{' '}
            {PRETRAINED_METRICS.holdoutMonths}-month period the model was never trained on:{' '}
            {(PRETRAINED_METRICS.confidentAccuracy * 100).toFixed(0)}% correct when it committed to a call.
            That is a small edge over guessing, not a crystal ball — never trade real money on it.
          </Text>
        </View>

        <View style={[styles.warningBanner, { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name="warning-outline" size={14} color={colors.danger} />
          <Text style={[styles.warningText, { color: colors.danger }]}>
            This is one data point, not a signal to act on — the measured accuracy above is real, but modest.
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { fontSize: 15, fontWeight: '700' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  heroIconWrap: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { fontSize: 17, fontWeight: '700' },
  heroSub: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  heroPctWrap: { alignItems: 'center' },
  heroPct: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  heroPctLabel: { fontSize: 10.5, fontWeight: '600', marginTop: 1 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  infoText: { flex: 1, fontSize: 11, lineHeight: 15 },
  body: { fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  section: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md, gap: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  driverLabel: { fontSize: 13, flex: 1 },
  newsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newsTone: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  headline: { fontSize: 12.5, lineHeight: 17 },
  footnote: { fontSize: 11.5, lineHeight: 16 },
  bar: { height: 4, borderRadius: radius.sm },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  warningText: { flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 15 },
});
