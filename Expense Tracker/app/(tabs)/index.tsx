import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MarketSpotlightCard } from '@/components/home/MarketSpotlightCard';
import { DirectionBadge } from '@/components/stocks/DirectionBadge';
import { StockListItem } from '@/components/stocks/StockListItem';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TIER_LABELS } from '@/constants/subscription';
import { tickerOf } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { useQuotes } from '@/hooks/useQuotes';
import { useRememberedScroll } from '@/hooks/useRememberedScroll';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { computeDirectionCall } from '@/services/market/signals';
import { getFullHistory } from '@/services/marketData/marketData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useQolStore } from '@/store/useQolStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { money, signedMoney, signedPct } from '@/utils/money';
import { summarizePortfolio } from '@/utils/portfolioMath';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HomeScreen() {
  const { colors } = useTheme();
  const portfolio = useActivePortfolio();
  const { cash, holdings } = portfolio;
  const watchlist = usePortfolioStore((s) => s.watchlist);
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();
  const hideBalances = useQolStore((s) => s.hideBalances);
  const setHideBalances = useQolStore((s) => s.setHideBalances);
  const recentStocks = useQolStore((s) => s.recentStocks);
  const lastActivity = useQolStore((s) => s.lastActivity);

  const trackedSymbols = useMemo(
    () => Array.from(new Set([...Object.keys(holdings), ...watchlist])),
    [holdings, watchlist]
  );
  const { quotes, refresh } = useQuotes(trackedSymbols);

  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);
  const rememberedScroll = useRememberedScroll('home');

  return (
    <Screen>
      <TopBar
        title="Home"
        subtitle="Your mock portfolio, at a glance"
        right={<IconButton name="settings-outline" onPress={() => router.push('/settings')} />}
      />
      <ScrollView
        ref={rememberedScroll.ref}
        onMomentumScrollEnd={rememberedScroll.onMomentumScrollEnd}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}>
        <Pressable onPress={() => setHideBalances(!hideBalances)} accessibilityLabel={hideBalances ? 'Show balances' : 'Hide balances'}>
        <View style={styles.statsRow}>
          <StatTile
            label="Net worth"
            value={hideBalances ? '••••••' : money(summary.netWorth)}
            numericValue={hideBalances ? undefined : summary.netWorth}
            format={hideBalances ? undefined : money}
            sub={hideBalances ? 'Tap to reveal' : `Cash: ${money(cash)}`}
          />
          <StatTile
            label="Today's P&L"
            value={hideBalances ? '••••••' : signedMoney(summary.todayPnl)}
            numericValue={hideBalances ? undefined : summary.todayPnl}
            format={hideBalances ? undefined : signedMoney}
            sub={hideBalances ? 'Hidden' : signedPct(summary.todayPnlPct)}
            valueColor={summary.todayPnl >= 0 ? colors.success : colors.danger}
          />
          <StatTile
            label="All-time P&L"
            value={hideBalances ? '••••••' : signedMoney(summary.allTimePnl)}
            numericValue={hideBalances ? undefined : summary.allTimePnl}
            format={hideBalances ? undefined : signedMoney}
            sub={hideBalances ? 'Hidden' : signedPct(summary.allTimePnlPct)}
            valueColor={summary.allTimePnl >= 0 ? colors.success : colors.danger}
          />
          <StatTile label="Positions" value={String(summary.positionsCount)} sub={`Plan: ${TIER_LABELS[tier]}`} />
        </View>
        </Pressable>

        {lastActivity ? (
          <Pressable onPress={() => router.push(lastActivity.href as any)}>
            <Card style={[styles.resumeCard, { borderColor: colors.accent }]}>
              <Ionicons name={lastActivity.icon as keyof typeof Ionicons.glyphMap} size={19} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.resumeEyebrow, { color: colors.accent }]}>Resume</Text>
                <Text style={[styles.resumeLabel, { color: colors.text }]} numberOfLines={1}>{lastActivity.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.text3} />
            </Card>
          </Pressable>
        ) : null}

        {recentStocks.length ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.sm }]}>Recently viewed</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRow}>
              {recentStocks.map((symbol) => (
                <Pressable key={symbol} onPress={() => router.push(`/markets/${symbol}`)} style={[styles.recentChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.recentSymbol, { color: colors.text }]}>{symbol}</Text>
                  <Text style={[styles.recentName, { color: colors.text3 }]} numberOfLines={1}>{tickerOf(symbol)?.name ?? symbol}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {tier === 'free' ? (
          <View>
            <Pressable onPress={() => upgradeToTier('pro')}>
              <Card style={[styles.upsell, { borderColor: colors.accent }]}>
                <Ionicons name="sparkles" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.upsellTitle, { color: colors.text }]}>Unlock full forecasts</Text>
                  <Text style={[styles.upsellBody, { color: colors.text3 }]}>
                    Upgrade to Pro for price-range forecasts, live sentiment, and an unlimited analyst.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.text3} />
              </Card>
            </Pressable>
          </View>
        ) : null}
        <View>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Watchlist</Text>
            <Pressable style={styles.linkPressable} onPress={() => router.push('/markets')}>
              <Text style={[styles.link, { color: colors.accent }]}>See all markets</Text>
            </Pressable>
          </View>
          <Card>
            {watchlist.length === 0 ? (
              <EmptyState
                icon="⭐"
                title="No stocks watched yet"
                message="Browse mock stocks and tap the star to add one to your watchlist."
                actionLabel="Explore markets"
                onAction={() => router.push('/markets')}
              />
            ) : (
              watchlist.map((symbol) => {
                const t = tickerOf(symbol);
                const direction = computeDirectionCall(symbol, getFullHistory(symbol)).direction;
                return (
                  <View key={symbol} style={styles.watchRow}>
                    <View style={{ flex: 1 }}>
                      <StockListItem
                        symbol={symbol}
                        name={t?.name ?? symbol}
                        quote={quotes.get(symbol)}
                        onPress={() => router.push(`/markets/${symbol}`)}
                      />
                    </View>
                    <DirectionBadge direction={direction} size="sm" />
                  </View>
                );
              })
            )}
          </Card>
        </View>

        <MarketSpotlightCard />

        {/* Quick Actions with Spring Press Scale */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.md }]}>Quick actions</Text>
          <View style={styles.actionsRow}>
            <QuickAction icon="pie-chart-outline" label="Portfolio" onPress={() => router.push('/markets/portfolio')} />
            <QuickAction icon="receipt-outline" label="Log expense" onPress={() => router.push('/expenses/add')} />
            <QuickAction icon="stats-chart-outline" label="Explore markets" onPress={() => router.push('/markets')} />
            <QuickAction icon="sparkles-outline" label="Ask the analyst" onPress={() => router.push('/assistant')} />
            <QuickAction icon="calculator-outline" label="Investor toolkit" onPress={() => router.push('/toolkit')} />
            <QuickAction icon="search-outline" label="Quick search" onPress={() => router.push('/search')} />
          </View>
        </View>

        {/* Weekly recap — an instant, local "wrapped"-style deck (app/recap.tsx),
            never gated on an AI call so it's there the very first time
            someone opens the app, not just after a week of activity. */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.md }]}>Weekly recap</Text>
          <Pressable onPress={() => router.push('/recap')}>
            <Card style={[styles.recapLauncher, { borderColor: colors.accent }]}>
              <View style={[styles.recapIconWrap, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="sparkles" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recapTitle, { color: colors.text }]}>Your week, wrapped</Text>
                <Text style={[styles.recapBody, { color: colors.text3 }]}>
                  Your stocks, your money, your streak — swipe through this week's highlights.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text3} />
            </Card>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.94, springs.snappy);
    triggerFeedback('navigation');
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.actionItem, animatedStyle]}>
      <Card style={styles.actionCard}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={[styles.actionLabel, { color: colors.text }]} numberOfLines={2}>
          {label}
        </Text>
      </Card>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.xl, paddingBottom: spacing.xxl },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  resumeCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  resumeEyebrow: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  resumeLabel: { fontSize: 13.5, fontWeight: '700', marginTop: 1 },
  recentRow: { gap: spacing.sm, paddingRight: spacing.xl },
  recentChip: { width: 132, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md },
  recentSymbol: { fontSize: 13.5, fontWeight: '800' },
  recentName: { fontSize: 10.5, marginTop: 2 },
  upsellTitle: { fontSize: 14.5, fontWeight: '700' },
  upsellBody: { fontSize: 12.5, marginTop: 2 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  // flexShrink on the title and on the link's own Pressable (flexShrink has
  // to sit on the actual flex child, not a grandchild) — without either,
  // "Watchlist" and "See all markets" each render at their unwrapped
  // natural width and, once that no longer fits at a larger font scale,
  // clip with no "…" instead of wrapping onto a 2nd line.
  sectionTitle: { fontSize: 15.5, fontWeight: '700', flexShrink: 1 },
  link: { fontSize: 13, fontWeight: '600' },
  linkPressable: { flexShrink: 1 },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // Four across is too narrow for the labels on a phone, so these wrap to a
  // 2x2 grid: basis under half the row forces two per line, and flexGrow
  // then spreads them to fill it exactly.
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionItem: { flexGrow: 1, flexBasis: '45%' },
  actionCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  // actionCard centers its children by content size, which never bounds
  // this Text's width — flexShrink (+ the numberOfLines={2} at the call
  // site) lets a label that no longer fits at a larger font scale wrap
  // instead of getting clipped mid-word with no "…".
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  recapLauncher: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  recapIconWrap: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  recapTitle: { fontSize: 14.5, fontWeight: '700' },
  recapBody: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },
});
