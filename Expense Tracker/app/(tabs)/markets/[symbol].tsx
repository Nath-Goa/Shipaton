import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PriceChart } from '@/components/charts/PriceChart';
import { DirectionBadge } from '@/components/stocks/DirectionBadge';
import { PredictionCard } from '@/components/stocks/PredictionCard';
import { SentimentGauge } from '@/components/stocks/SentimentGauge';
import { AdPlaceholder } from '@/components/ui/AdPlaceholder';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { TIER_FEATURES } from '@/constants/subscription';
import { radius, spacing } from '@/constants/theme';
import { tickerOf } from '@/constants/tickers';
import { trackingFor } from '@/constants/typography';
import { useBarsVersion } from '@/hooks/useBarsVersion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError } from '@/services/ai/errorMessage';
import { detectPatterns, explainChartPoint } from '@/services/ai/learn';
import { computeDirectionCall, computeForecastBand, computeSentiment } from '@/services/market/signals';
import { getFullHistory, getHistory, getQuote } from '@/services/marketData/marketData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useQolStore } from '@/store/useQolStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStockViewStore } from '@/store/useStockViewStore';
import { useStreakStore } from '@/store/useStreakStore';
import type { PatternDetectionResult } from '@/types/pattern';
import type { PriceBar, Quote, Range } from '@/types/stock';
import { formatShortDate } from '@/utils/date';
import { money, signedMoney, signedPct } from '@/utils/money';

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '1W', label: '1W' },
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '1Y', label: '1Y' },
];

export default function StockDetailScreen() {
  const { symbol: rawSymbol } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (rawSymbol ?? '').toUpperCase();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const upgradeToTier = useUpgradeToTier();
  const { holdings } = useActivePortfolio();
  const { watchlist, toggleWatchlist } = usePortfolioStore();
  const recordStockView = useStockViewStore((s) => s.recordView);
  const wouldExceedLimit = useStockViewStore((s) => s.wouldExceedLimit);
  const recordPatternDetectionViewed = useStreakStore((s) => s.recordPatternDetectionViewed);
  const recordRecentStock = useQolStore((s) => s.recordStock);
  const setLastActivity = useQolStore((s) => s.setLastActivity);

  const [range, setRange] = useState<Range>('3M');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [showAd, setShowAd] = useState(false);
  const [patternResult, setPatternResult] = useState<PatternDetectionResult | null>(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState<string | null>(null);

  const [explainBar, setExplainBar] = useState<PriceBar | null>(null);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  const starScale = useSharedValue(1);
  const refreshSpin = useSharedValue(0);
  const priceFlashOpacity = useSharedValue(0);
  const prevPriceRef = useRef(quote?.price);
  // Mirrors StarButton's own guard: RN fires onPress before onPressOut on a
  // successful tap, so without this onPressOut would immediately spring the
  // star back to 1 and cut off handleToggleWatchlist's bounce mid-overshoot.
  const starPressCommittedRef = useRef(false);

  const blocked = wouldExceedLimit(symbol, features.stockDetailDailyLimit);

  useEffect(() => {
    if (blocked || !symbol) return;
    const { lookupCount } = recordStockView(symbol);
    recordRecentStock(symbol);
    setLastActivity({ label: `Continue with ${symbol}`, href: `/markets/${symbol}`, icon: 'stats-chart-outline' });
    setShowAd(features.adsEnabled && lookupCount % 3 === 0);
  }, [symbol, blocked, features.adsEnabled, recordStockView, recordRecentStock, setLastActivity]);

  // One fetch per visit, not a continuous poll — this screen unmounts and
  // remounts fresh on every push/pop (CLAUDE.md §5.1), so a plain focus
  // fetch already gives "current price when you open it." It then holds
  // steady until the refresh button is tapped (handleRefreshQuote below),
  // rather than ticking every few seconds while you're just reading the
  // chart.
  useFocusEffect(
    useCallback(() => {
      if (blocked) return;
      setQuote(getQuote(symbol));
    }, [symbol, blocked])
  );

  function handleRefreshQuote() {
    triggerFeedback('secondary');
    refreshSpin.value = withTiming(refreshSpin.value + 360, { duration: 500, easing: Easing.out(Easing.cubic) });
    setQuote(getQuote(symbol));
  }

  const refreshSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${refreshSpin.value}deg` }],
  }));

  useEffect(() => {
    if (quote?.price && prevPriceRef.current && quote.price !== prevPriceRef.current) {
      priceFlashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 600 })
      );
    }
    prevPriceRef.current = quote?.price;
  }, [quote?.price, priceFlashOpacity]);

  const ticker = tickerOf(symbol);
  // Not referenced inside the memos — it's there so they re-read once live
  // bars replace the mock ones the first read returned (see useBarsVersion).
  const barsVersion = useBarsVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bars = useMemo(() => getHistory(symbol, range), [symbol, range, barsVersion]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fullHistory = useMemo(() => getFullHistory(symbol), [symbol, barsVersion]);
  const directionCall = useMemo(() => computeDirectionCall(symbol, fullHistory), [symbol, fullHistory]);
  const forecast = useMemo(() => computeForecastBand(fullHistory, 7), [symbol, fullHistory]);
  const sentiment = useMemo(() => computeSentiment(symbol, fullHistory), [symbol, fullHistory]);

  const holding = holdings[symbol];
  const watched = watchlist.includes(symbol);
  const price = quote?.price ?? bars[bars.length - 1]?.close ?? ticker?.basePrice ?? 0;
  const changePct = quote?.changePct ?? 0;
  const up = changePct >= 0;

  function handleStarPressIn() {
    starPressCommittedRef.current = false;
    // Instant, subtle feedback the moment the finger lands — nothing has
    // been committed yet, so no haptic here (matches StarButton.tsx's own
    // causality-driven fix: the pop represents "you just toggled it," which
    // should only fire on commit, not on touch-down).
    starScale.value = reducedMotion ? 1 : withSpring(0.9, springs.tap);
  }

  function handleStarPressOut() {
    if (starPressCommittedRef.current) return;
    starScale.value = withSpring(1, springs.tap);
  }

  function handleToggleWatchlist() {
    starPressCommittedRef.current = true;
    triggerFeedback('selection');
    starScale.value = reducedMotion
      ? withTiming(1, { duration: 150 })
      : withSequence(withSpring(1.35, springs.bouncy), withSpring(1, springs.snappy));
    toggleWatchlist(symbol);
  }

  const starAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: starScale.value }],
    };
  });

  const priceFlashStyle = useAnimatedStyle(() => {
    return {
      opacity: priceFlashOpacity.value,
    };
  });

  function handleChartPointPress(bar: PriceBar, index: number) {
    triggerFeedback('selection');
    setExplainBar(bar);
    setExplainText(null);
    setExplainError(null);
    setExplainLoading(true);
    explainChartPoint(symbol, bars, index).then((result) => {
      setExplainLoading(false);
      if (!result.ok) {
        setExplainError(describeAiError(result.error));
        return;
      }
      setExplainText(result.data);
    });
  }

  async function runPatternAnalysis() {
    triggerFeedback('primary');
    setPatternLoading(true);
    setPatternError(null);
    const result = await detectPatterns(symbol, fullHistory);
    setPatternLoading(false);
    if (!result.ok) {
      setPatternError(describeAiError(result.error));
      return;
    }
    setPatternResult(result.data);
    recordPatternDetectionViewed();
  }

  // Not part of the curated 27 this app trades — reached via Markets'
  // "also on the market" live-search fallback (a real symbol Yahoo knows
  // about, just outside the app's mock-trading/predictor universe). Still
  // worth a real screen rather than "Unknown symbol": getQuote/getHistory
  // work for any symbol already (they fall back through live-fetch, then
  // cached bars, then the mock engine's generic defaults), so price + chart
  // + watchlist all work here. What's deliberately NOT shown: buy/sell (not
  // part of the tradeable universe), the trained predictor, forecast band,
  // and sentiment — all of those were measured/fitted against the curated
  // universe specifically, and showing them for a symbol outside that scope
  // would be a confidence claim this app can't actually back up.
  if (!ticker) {
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: symbol }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Animated.View entering={FadeInDown.duration(350).springify().damping(16)}>
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: colors.text }]}>{money(price)}</Text>
              <View style={[styles.changePill, { backgroundColor: up ? colors.successSoft : colors.dangerSoft }]}>
                <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={up ? colors.success : colors.danger} />
                <Text style={[styles.change, { color: up ? colors.success : colors.danger }]}>
                  {signedMoney(quote?.changeAbs ?? 0)} ({signedPct(changePct)})
                </Text>
              </View>
            </View>
            <Text style={[styles.todayLabel, { color: colors.text3 }]}>Today</Text>
          </Animated.View>

          <Card style={styles.notTrackedBanner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.text3} />
            <Text style={[styles.notTrackedText, { color: colors.text2 }]}>
              {symbol} isn't in this app's mock-trading list — showing its real live price for reference. No buy/sell,
              price prediction, or sentiment here; those are only measured for tracked stocks.
            </Text>
          </Card>

          <Card>
            <PriceChart bars={bars} height={190} />
          </Card>

          <Button
            label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            variant="ghost"
            fullWidth
            onPress={handleToggleWatchlist}
          />
        </ScrollView>
      </Screen>
    );
  }

  if (blocked) {
    return (
      <Screen edges={['left', 'right']}>
        <Stack.Screen options={{ title: symbol }} />
        <EmptyState
          icon="🔒"
          title="Daily stock limit reached"
          message={`Free includes ${features.stockDetailDailyLimit} stock lookups a day. Upgrade to Pro for unlimited access to every stock.`}
          actionLabel="Upgrade to Pro"
          onAction={() => upgradeToTier('pro')}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right']}>
      <Stack.Screen
        options={{
          title: symbol,
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable hitSlop={8} onPress={handleRefreshQuote}>
                <Animated.View style={refreshSpinStyle}>
                  <Ionicons name="refresh-outline" size={20} color={colors.text2} />
                </Animated.View>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPressIn={handleStarPressIn}
                onPress={handleToggleWatchlist}
                onPressOut={handleStarPressOut}>
                <Animated.View style={starAnimatedStyle}>
                  <Ionicons
                    name={watched ? 'star' : 'star-outline'}
                    size={21}
                    color={watched ? colors.warning : colors.text2}
                  />
                </Animated.View>
              </Pressable>
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Animated Hero Price Header */}
        <Animated.View entering={FadeInDown.duration(350).springify().damping(16)}>
          <Text style={[styles.name, { color: colors.text3 }]}>{ticker.name}</Text>
          <View style={styles.priceRow}>
            <View style={{ position: 'relative' }}>
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: up ? colors.successSoft : colors.dangerSoft,
                    borderRadius: 6,
                    marginHorizontal: -4,
                  },
                  priceFlashStyle,
                ]}
              />
              <Text style={[styles.price, { color: colors.text }]}>{money(price)}</Text>
            </View>
            <View style={[styles.changePill, { backgroundColor: up ? colors.successSoft : colors.dangerSoft }]}>
              <Ionicons name={up ? 'caret-up' : 'caret-down'} size={12} color={up ? colors.success : colors.danger} />
              <Text style={[styles.change, { color: up ? colors.success : colors.danger }]}>
                {signedMoney(quote?.changeAbs ?? 0)} ({signedPct(changePct)})
              </Text>
            </View>
          </View>
          <Text style={[styles.todayLabel, { color: colors.text3 }]}>Today's change</Text>
        </Animated.View>

        {showAd ? <AdPlaceholder /> : null}

        {holding ? (
          <Animated.View entering={FadeInDown.delay(60).springify().damping(16)}>
            <Card style={styles.positionCard}>
              <View>
                <Text style={[styles.positionLabel, { color: colors.text3 }]}>Your position</Text>
                <Text style={[styles.positionQty, { color: colors.text }]}>
                  {holding.qty} shares · avg {money(holding.avgCost)}
                </Text>
              </View>
              <Text
                style={{
                  color: (price - holding.avgCost) * holding.qty >= 0 ? colors.success : colors.danger,
                  fontWeight: '700',
                  fontSize: 16,
                }}>
                {signedMoney((price - holding.avgCost) * holding.qty)}
              </Text>
            </Card>
          </Animated.View>
        ) : null}

        {/* Interactive Chart Card with Range Switcher */}
        <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
          <Card>
            <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
            <View style={{ height: spacing.lg }} />
            <PriceChart
              bars={bars}
              forecast={features.forecastBand ? forecast : undefined}
              trend={directionCall.direction}
              height={190}
              onPointPress={handleChartPointPress}
            />
            <Text style={[styles.tapHint, { color: colors.text3 }]}>Tap the chart to ask about a specific day</Text>
          </Card>
        </Animated.View>

        {explainBar ? (
          <Animated.View entering={FadeInUp.springify().damping(16)}>
            <Card>
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{formatShortDate(explainBar.date)}</Text>
                <Pressable hitSlop={8} onPress={() => setExplainBar(null)}>
                  <Ionicons name="close" size={18} color={colors.text3} />
                </Pressable>
              </View>
              <Text style={[styles.reason, { color: colors.text3 }]}>Close {money(explainBar.close)}</Text>
              {explainLoading ? (
                <Text style={[styles.reason, { color: colors.text3, marginTop: spacing.sm }]}>Thinking…</Text>
              ) : explainError ? (
                <Text style={[styles.patternError, { color: colors.danger }]}>{explainError}</Text>
              ) : explainText ? (
                <Text style={[styles.reason, { color: colors.text2, marginTop: spacing.sm }]}>{explainText}</Text>
              ) : null}
            </Card>
          </Animated.View>
        ) : null}

        {/* Trained price-direction model — replaces the old moving-average
            heuristic, which was a hand-written rule presented as a "call"
            with a confidence number nothing had ever measured. */}
        <Animated.View entering={FadeInDown.delay(140).springify().damping(16)}>
          <PredictionCard symbol={symbol} />
        </Animated.View>

        {/* Trend summary (the plain-language read of the moving averages) */}
        <Animated.View entering={FadeInDown.delay(160).springify().damping(16)}>
          <Card>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Trend summary</Text>
              <DirectionBadge direction={directionCall.direction} />
            </View>
            <Text style={[styles.reason, { color: colors.text2 }]}>{directionCall.reason}</Text>
            <Text style={[styles.confidence, { color: colors.text3 }]}>
              A description of what the averages are doing right now — not a forecast.
            </Text>
          </Card>
        </Animated.View>

        {/* Forecast Band */}
        {features.forecastBand ? (
          <Animated.View entering={FadeInDown.delay(180).springify().damping(16)}>
            <Card>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{forecast.horizonDays}-day price-range forecast</Text>
              <View style={styles.forecastRow}>
                <ForecastCol label="Low" value={money(forecast.low)} color={colors.danger} />
                <ForecastCol label="Mid" value={money(forecast.mid)} color={colors.text} />
                <ForecastCol label="High" value={money(forecast.high)} color={colors.success} />
              </View>
            </Card>
          </Animated.View>
        ) : (
          <LockedCard
            title="Price-range forecast"
            message="Pro unlocks a 7-day and 30-day forecast band with a confidence interval."
          />
        )}

        <Animated.View entering={FadeInDown.delay(200).springify().damping(16)}>
          <Text style={[styles.predictorDisclaimer, { color: colors.text3 }]}>
            The trend summary and price-range forecast are a simulated statistical estimate over this app's mock
            price history — not real market analysis, and not financial advice. They can be, and often will be,
            wrong. Use them for practice, not real decisions.
          </Text>
        </Animated.View>

        {/* Sentiment Gauge with Animated Needle */}
        <Animated.View entering={FadeInDown.delay(220).springify().damping(16)}>
          <Card>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Sentiment</Text>
              <PillBadge
                label={features.liveSentiment ? 'Live' : '24h delayed'}
                color={features.liveSentiment ? colors.success : colors.text3}
                backgroundColor={features.liveSentiment ? colors.successSoft : colors.surface2}
              />
            </View>
            <SentimentGauge score={sentiment.score} />
            <Text style={[styles.sentimentLabel, { color: colors.text }]}>{sentiment.label}</Text>
            <View style={{ gap: 6, marginTop: spacing.sm }}>
              {sentiment.headlines.map((h, i) => (
                <Text key={i} style={[styles.headline, { color: colors.text2 }]} numberOfLines={2}>
                  • {h.title}
                </Text>
              ))}
            </View>
          </Card>
        </Animated.View>

        {/* Deep Pattern Analysis */}
        {features.patternDetection ? (
          <Animated.View entering={FadeInDown.delay(260).springify().damping(16)}>
            <Card>
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Deep pattern analysis</Text>
                <Ionicons name="sparkles" size={16} color={colors.accent} />
              </View>
              {!patternResult ? (
                <>
                  <Text style={[styles.reason, { color: colors.text3, marginBottom: spacing.md }]}>
                    Ask the AI to scan this chart for technical patterns and anomalies, with a confidence score for each.
                  </Text>
                  <Button label="Run analysis" variant="ghost" loading={patternLoading} onPress={runPatternAnalysis} />
                  {patternError ? <Text style={[styles.patternError, { color: colors.danger }]}>{patternError}</Text> : null}
                </>
              ) : (
                <Animated.View entering={FadeInUp.springify().damping(16)} style={{ gap: spacing.md }}>
                  <Text style={[styles.reason, { color: colors.text2 }]}>{patternResult.summary}</Text>
                  {patternResult.patterns.map((p, i) => (
                    <View key={i} style={[styles.patternRow, { borderColor: colors.border }]}>
                      <View style={styles.cardHead}>
                        <Text style={[styles.patternName, { color: colors.text }]}>{p.name}</Text>
                        <PillBadge label={`${p.confidence}%`} />
                      </View>
                      <Text style={[styles.reason, { color: colors.text2 }]}>{p.reasoning}</Text>
                      {p.learningMoment ? (
                        <Text style={[styles.learningMoment, { color: colors.accent }]}>💡 {p.learningMoment}</Text>
                      ) : null}
                    </View>
                  ))}
                  {patternResult.anomalies.map((a, i) => (
                    <View key={i} style={[styles.patternRow, { borderColor: colors.border }]}>
                      <Text style={[styles.patternName, { color: colors.text }]}>{a.type}</Text>
                      <Text style={[styles.reason, { color: colors.text2 }]}>{a.reasoning}</Text>
                    </View>
                  ))}
                  {patternResult.nextActions.map((n, i) => (
                    <Text key={i} style={[styles.headline, { color: colors.text3 }]}>
                      → {n}
                    </Text>
                  ))}
                  <Button label="Run again" variant="ghost" loading={patternLoading} onPress={runPatternAnalysis} />
                </Animated.View>
              )}
            </Card>
          </Animated.View>
        ) : (
          <LockedCard
            title="Deep pattern analysis"
            message="Pro unlocks AI-powered pattern & anomaly detection with confidence scores for every stock."
          />
        )}

        {/* Action Buttons with Spring Touch */}
        <Animated.View entering={FadeInDown.delay(300).springify().damping(16)} style={styles.ctaRow}>
          <View style={{ flex: 1 }}>
            <Button label="Sell" variant="danger" fullWidth onPress={() => router.push(`/markets/portfolio/trade/${symbol}?side=sell`)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Buy" fullWidth onPress={() => router.push(`/markets/portfolio/trade/${symbol}?side=buy`)} />
          </View>
        </Animated.View>
        <Button
          label="Ask the analyst about this stock"
          variant="ghost"
          fullWidth
          onPress={() => router.push({ pathname: '/assistant', params: { symbol } })}
        />
      </ScrollView>
    </Screen>
  );
}

function ForecastCol({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.forecastCol}>
      <Text style={[styles.forecastLabel, { color: colors.text3 }]}>{label}</Text>
      <Text style={[styles.forecastValue, { color }]}>{value}</Text>
    </View>
  );
}

function LockedCard({ title, message }: { title: string; message: string }) {
  const { colors } = useTheme();
  const upgradeToTier = useUpgradeToTier();
  return (
    <Card style={{ opacity: 0.9 }}>
      <View style={styles.cardHead}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Ionicons name="lock-closed" size={16} color={colors.text3} />
      </View>
      <Text style={[styles.reason, { color: colors.text3, marginBottom: spacing.md }]}>{message}</Text>
      <Button label="Upgrade to Pro" variant="ghost" onPress={() => upgradeToTier('pro')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  notTrackedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notTrackedText: { flex: 1, fontSize: 12.5, letterSpacing: trackingFor(12.5), lineHeight: 17 },
  name: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 },
  price: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  change: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '700' },
  todayLabel: { fontSize: 11.5, letterSpacing: trackingFor(11.5), fontWeight: '600', marginTop: 4 },
  positionCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  positionLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  positionQty: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '600', marginTop: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  cardTitle: { fontSize: 15, letterSpacing: trackingFor(15), fontWeight: '700' },
  reason: { fontSize: 13.5, letterSpacing: trackingFor(13.5), lineHeight: 19 },
  confidence: { fontSize: 12, letterSpacing: trackingFor(12), marginTop: spacing.sm },
  predictorDisclaimer: { fontSize: 11.5, letterSpacing: trackingFor(11.5), lineHeight: 16, textAlign: 'center', paddingHorizontal: spacing.sm },
  tapHint: { fontSize: 11, letterSpacing: trackingFor(11), textAlign: 'center', marginTop: spacing.sm },
  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  forecastCol: { alignItems: 'center', flex: 1 },
  forecastLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: trackingFor(11, { uppercase: true }) },
  forecastValue: { fontSize: 16, letterSpacing: trackingFor(16), fontWeight: '700', marginTop: 4 },
  sentimentLabel: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '700', marginTop: spacing.sm },
  headline: { fontSize: 12.5, letterSpacing: trackingFor(12.5), lineHeight: 17 },
  ctaRow: { flexDirection: 'row', gap: spacing.md },
  patternRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: 4 },
  patternName: { fontSize: 13.5, letterSpacing: trackingFor(13.5), fontWeight: '700', textTransform: 'capitalize' },
  patternError: { fontSize: 12.5, letterSpacing: trackingFor(12.5), fontWeight: '600', marginTop: spacing.sm },
  learningMoment: { fontSize: 12.5, letterSpacing: trackingFor(12.5), fontWeight: '600', marginTop: 2 },
});
