import { Ionicons } from '@expo/vector-icons';
import { router, Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { COURSES } from '@/constants/courses';
import { radius, spacing } from '@/constants/theme';
import { TICKERS } from '@/constants/tickers';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';

const DESTINATIONS: { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap; href: Href }[] = [
  { label: 'Portfolio', detail: 'Holdings, cash, and performance', icon: 'pie-chart-outline', href: '/markets/portfolio' },
  { label: 'Flashcards', detail: 'Fast investing-term review', icon: 'albums-outline', href: '/learn/flashcards' },
  { label: 'Investor Toolkit', detail: 'Twenty quick calculators', icon: 'calculator-outline', href: '/toolkit' },
  { label: 'Add expense', detail: 'Quickly log new spending', icon: 'add-circle-outline', href: '/expenses/add' },
  { label: 'Budgets', detail: 'Track category limits', icon: 'speedometer-outline', href: '/expenses/budgets' },
  { label: 'Settings', detail: 'Appearance and app behavior', icon: 'settings-outline', href: '/settings' },
];

export default function GlobalSearchScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!normalized) return DESTINATIONS;
    const destinations = DESTINATIONS.filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(normalized));
    const stocks = TICKERS.filter((item) => `${item.symbol} ${item.name} ${item.sector}`.toLowerCase().includes(normalized)).slice(0, 6).map((item) => ({
      label: `${item.symbol} · ${item.name}`, detail: item.sector, icon: 'stats-chart-outline' as const, href: `/markets/${item.symbol}` as Href,
    }));
    const courses = COURSES.filter((item) => `${item.title} ${item.summary}`.toLowerCase().includes(normalized)).slice(0, 8).map((item) => ({
      label: item.title, detail: `Stage ${item.stage} course`, icon: item.icon, href: `/learn/course/${item.id}` as Href,
    }));
    return [...destinations, ...stocks, ...courses];
  }, [normalized]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Quick Search' }} />
      <View style={[styles.search, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.text3} />
        <TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Stocks, courses, or pages" placeholderTextColor={colors.text3} style={[styles.input, { color: colors.text }]} />
        {query ? <Pressable feedbackCategory="selection" onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={colors.text3} /></Pressable> : null}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.count, { color: colors.text3 }]}>{results.length} result{results.length === 1 ? '' : 's'}</Text>
        <Card style={styles.resultsCard}>
          {results.map((item, index) => (
            <Pressable
              key={`${item.label}-${item.href}`}
              feedbackCategory="navigation"
              onPress={() => router.replace(item.href)}
              style={[styles.row, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <Ionicons name={item.icon} size={19} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>{item.label}</Text>
                <Text style={[styles.detail, { color: colors.text3 }]} numberOfLines={1}>{item.detail}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.text3} />
            </Pressable>
          ))}
          {!results.length ? <Text style={[styles.empty, { color: colors.text3 }]}>No matches. Try a ticker, course topic, or app page.</Text> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { margin: spacing.xl, marginBottom: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md },
  input: { flex: 1, minHeight: 46, fontSize: 14, letterSpacing: trackingFor(14) },
  content: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.xxl },
  count: { fontSize: 11.5, letterSpacing: trackingFor(11.5), fontWeight: '700' },
  resultsCard: { padding: 0, overflow: 'hidden' },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md },
  label: { fontSize: 13.5, letterSpacing: trackingFor(13.5), fontWeight: '700' },
  detail: { fontSize: 11.5, letterSpacing: trackingFor(11.5), marginTop: 2 },
  empty: { padding: spacing.xl, textAlign: 'center', fontSize: 12.5, letterSpacing: trackingFor(12.5) },
});

