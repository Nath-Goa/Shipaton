import { Redirect, router, type Href } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { MarketDataStatusCard } from '@/components/settings/MarketDataStatusCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import type { Tier } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import { useExpenseStore } from '@/store/useExpenseStore';
import { usePredictorStore } from '@/store/usePredictorStore';
import { useSettingsStore } from '@/store/useSettingsStore';

type DebugLink = { label: string; href: Href };

const TIER_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
  { value: 'max', label: 'Max' },
];

const LEARN_LINKS: DebugLink[] = [
  { label: 'Learn home', href: '/learn' },
  { label: 'Choose learner level', href: '/learn/level-select' },
  { label: 'Course overview', href: '/learn/course/market-basics' },
  { label: 'Standard lesson', href: '/learn/course/market-basics/lesson?debugMode=standard' },
  { label: 'ELI5 lesson', href: '/learn/course/market-basics/lesson?debugMode=eli5' },
  { label: 'AI story lesson', href: '/learn/course/market-basics/lesson?debugMode=story' },
  { label: 'Visual learning', href: '/learn/course/market-basics/lesson?debugMode=visual' },
  { label: 'Course practice', href: '/learn/course/market-basics/practice' },
  { label: 'Flashcard topics', href: '/learn/flashcards' },
  { label: 'Market-cap flashcards', href: '/learn/flashcards?topic=market_cap&fromCourse=market-basics' },
  { label: 'Regular quiz', href: '/learn/quiz?topic=market_cap' },
  { label: 'Mastery quiz', href: '/learn/quiz?topic=market_cap&mode=mastery&fromCourse=market-basics' },
  { label: 'Daily challenge', href: '/learn/narrative' },
  { label: 'Trivia battle', href: '/learn/trivia' },
  { label: 'Focus session', href: '/learn/focus-session' },
];

const MARKET_LINKS: DebugLink[] = [
  { label: 'Markets home', href: '/markets' },
  { label: 'Tracked stock + predictor', href: '/markets/AAPL' },
  { label: 'Untracked-stock view', href: '/markets/IBM' },
  { label: 'Practice trading', href: '/markets/practice' },
  { label: '$100k vs AI arena', href: '/markets/arena' },
  { label: 'Predictor backtest', href: '/markets/backtest' },
  { label: 'Product scanner', href: '/scanner' },
];

const PORTFOLIO_LINKS: DebugLink[] = [
  { label: 'Portfolio home', href: '/markets/portfolio' },
  { label: 'Buy AAPL', href: '/markets/portfolio/trade/AAPL?side=buy' },
  { label: 'Sell AAPL', href: '/markets/portfolio/trade/AAPL?side=sell' },
  { label: 'Manage portfolios', href: '/markets/portfolio/manage' },
  { label: 'Net-worth history', href: '/markets/portfolio/networth' },
  { label: 'Leaderboard', href: '/markets/portfolio/leaderboard' },
  { label: 'Friends, families & duels', href: '/markets/portfolio/social' },
  { label: 'New family duel', href: '/markets/portfolio/social/new-duel?kind=family' },
];

const FINANCE_LINKS: DebugLink[] = [
  { label: 'News feed', href: '/news' },
  { label: 'Expenses home', href: '/expenses' },
  { label: 'Add expense + receipt AI', href: '/expenses/add' },
  { label: 'Budgets', href: '/expenses/budgets' },
  { label: 'Savings goals', href: '/expenses/goals' },
  { label: 'General AI assistant', href: '/assistant' },
  { label: 'AAPL AI assistant', href: '/assistant?symbol=AAPL' },
];

const SYSTEM_LINKS: DebugLink[] = [
  { label: 'Bird game', href: '/game' },
  { label: 'Investor toolkit (20 tools)', href: '/toolkit' },
  { label: 'Weekly recap', href: '/recap' },
  { label: 'Upgrade / paywall', href: '/settings/upgrade' },
  { label: 'Achievements', href: '/settings/achievements' },
  { label: 'Personal records', href: '/settings/records' },
  { label: 'Main settings', href: '/settings' },
];

export default function DebugMenuScreen() {
  const { colors } = useTheme();
  const tier = useSettingsStore((state) => state.tier);
  const setTier = useSettingsStore((state) => state.setTier);
  const modelVersion = usePredictorStore((state) => state.modelVersion);
  const pendingPredictions = usePredictorStore((state) => state.pending.length);
  const resolvedPredictions = usePredictorStore((state) => state.resolved.length);
  const firstExpenseId = useExpenseStore((state) => state.expenses[0]?.id);

  if (!__DEV__) return <Redirect href="/settings" />;

  const financeLinks = firstExpenseId
    ? [
        ...FINANCE_LINKS.slice(0, 3),
        { label: 'Edit first expense', href: `/expenses/${firstExpenseId}` as Href },
        ...FINANCE_LINKS.slice(3),
      ]
    : FINANCE_LINKS;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Feature tier</Text>
        <Card style={styles.cardContent}>
          <SegmentedControl options={TIER_OPTIONS} value={tier} onChange={(value) => setTier(value as Tier)} />
          <Text style={[styles.note, { color: colors.text3 }]}>Switch tiers to test both paywalls and unlocked feature states.</Text>
        </Card>

        <DebugGroup title="Learn" links={LEARN_LINKS} />
        <DebugGroup title="Markets" links={MARKET_LINKS} />
        <DebugGroup title="Portfolio & social" links={PORTFOLIO_LINKS} />
        <DebugGroup title="News, expenses & assistant" links={financeLinks} />
        <DebugGroup title="Previews & settings" links={SYSTEM_LINKS} />

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Runtime</Text>
        <Card style={styles.cardContent}>
          <DebugRow label="Mode" value="Development" />
          <DebugRow label="Platform" value={Platform.OS} />
          <DebugRow label="Tier" value={tier} />
          <DebugRow label="Predictor model" value={`v${modelVersion}`} />
          <DebugRow label="Predictions" value={`${pendingPredictions} pending · ${resolvedPredictions} resolved`} />
        </Card>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Market diagnostics</Text>
        <MarketDataStatusCard />
      </ScrollView>
    </Screen>
  );
}

function DebugGroup({ title, links }: { title: string; links: DebugLink[] }) {
  const { colors } = useTheme();
  return (
    <>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <Card style={styles.linkGrid}>
        {links.map((link) => (
          <View key={link.label} style={styles.linkButton}>
            <Button label={link.label} variant="ghost" fullWidth onPress={() => router.push(link.href)} />
          </View>
        ))}
      </Card>
    </>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text3 }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xl * 2, gap: spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: spacing.sm },
  cardContent: { gap: spacing.md },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  linkButton: { width: '48%', flexGrow: 1 },
  note: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  label: { fontSize: 12, fontWeight: '600' },
  value: { flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'right', textTransform: 'capitalize' },
});
