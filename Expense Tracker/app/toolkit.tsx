import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { INVESTOR_TOOLS, type InvestorTool } from '@/constants/investorTools';
import { radius, spacing } from '@/constants/theme';
import { TIER_LABELS, type Tier } from '@/constants/subscription';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { useSettingsStore } from '@/store/useSettingsStore';

const CATEGORIES = ['All', 'Growth', 'Trading', 'Valuation', 'Planning'] as const;
type Category = (typeof CATEGORIES)[number];

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, max: 2 };

export default function ToolkitScreen() {
  const { colors } = useTheme();
  const tier = useSettingsStore((state) => state.tier);
  const [category, setCategory] = useState<Category>('All');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(INVESTOR_TOOLS[0]?.id ?? null);

  const filteredTools = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return INVESTOR_TOOLS.filter((tool) => {
      const inCategory = category === 'All' || tool.category === category;
      const matchesSearch = !normalized || `${tool.title} ${tool.summary} ${tool.category}`.toLowerCase().includes(normalized);
      return inCategory && matchesSearch;
    });
  }, [category, query]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Investor Toolkit' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={[styles.hero, { borderColor: colors.accent }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="construct-outline" size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>20 small tools, zero spreadsheet setup</Text>
            <Text style={[styles.heroText, { color: colors.text3 }]}>Fast estimates for better mock-trading and planning decisions.</Text>
          </View>
        </Card>

        <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.text3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find a calculator"
            placeholderTextColor={colors.text3}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
          />
          {query ? (
            <Pressable feedbackCategory="selection" onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.text3} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((item) => (
            <Chip key={item} label={item} active={category === item} onPress={() => setCategory(item)} />
          ))}
        </ScrollView>

        <View style={styles.resultCountRow}>
          <Text style={[styles.resultCount, { color: colors.text3 }]}>{filteredTools.length} tools</Text>
          <Text style={[styles.planText, { color: colors.text3 }]}>Your plan: {TIER_LABELS[tier]}</Text>
        </View>

        <View style={styles.toolList}>
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              unlocked={TIER_RANK[tier] >= TIER_RANK[tool.tier]}
              expanded={expandedId === tool.id}
              onToggle={() => setExpandedId((current) => current === tool.id ? null : tool.id)}
            />
          ))}
        </View>

        {filteredTools.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons name="search-outline" size={24} color={colors.text3} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No matching tools</Text>
            <Button label="Clear filters" variant="ghost" onPress={() => { setQuery(''); setCategory('All'); }} />
          </Card>
        ) : null}

        <Text style={[styles.disclaimer, { color: colors.text3 }]}>
          Educational estimates only. Results do not include every tax, fee, market movement, or personal circumstance and are not financial advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function ToolCard({
  tool,
  unlocked,
  expanded,
  onToggle,
}: {
  tool: InvestorTool;
  unlocked: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const upgradeToTier = useUpgradeToTier();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tool.inputs.map((input) => [input.key, input.defaultValue]))
  );

  const numericValues = Object.fromEntries(
    tool.inputs.map((input) => [input.key, Number(values[input.key])])
  );
  const result = unlocked ? tool.calculate(numericValues) : null;
  const badgeColor = tool.tier === 'max' ? colors.warning : tool.tier === 'pro' ? colors.accent : colors.success;

  function reset() {
    setValues(Object.fromEntries(tool.inputs.map((input) => [input.key, input.defaultValue])));
  }

  return (
    <Card style={[styles.toolCard, expanded && { borderColor: colors.accent }]}>
      <Pressable feedbackCategory="selection" onPress={unlocked ? onToggle : () => upgradeToTier(tool.tier as Exclude<Tier, 'free'>)}>
        <View style={styles.toolHeader}>
          <View style={[styles.toolIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={tool.icon} size={19} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.toolTitle, { color: colors.text }]}>{tool.title}</Text>
              <View style={[styles.tierPill, { borderColor: badgeColor }]}>
                <Text style={[styles.tierPillText, { color: badgeColor }]}>{TIER_LABELS[tool.tier]}</Text>
              </View>
            </View>
            <Text style={[styles.toolSummary, { color: colors.text3 }]}>{tool.summary}</Text>
          </View>
          <Ionicons
            name={!unlocked ? 'lock-closed' : expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.text3}
          />
        </View>
      </Pressable>

      {expanded && unlocked ? (
        <View style={[styles.calculator, { borderTopColor: colors.border }]}>
          <View style={styles.inputsGrid}>
            {tool.inputs.map((input) => (
              <View key={input.key} style={styles.inputField}>
                <Text style={[styles.inputLabel, { color: colors.text3 }]}>{input.label}</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
                  {input.prefix ? <Text style={[styles.affix, { color: colors.text3 }]}>{input.prefix}</Text> : null}
                  <TextInput
                    value={values[input.key] ?? ''}
                    onChangeText={(value) => setValues((current) => ({ ...current, [input.key]: value.replace(/[^0-9.-]/g, '') }))}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={[styles.numberInput, { color: colors.text }]}
                  />
                  {input.suffix ? <Text style={[styles.affix, { color: colors.text3 }]}>{input.suffix}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.resultBox, { backgroundColor: result ? colors.accentSoft : colors.dangerSoft }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultLabel, { color: result ? colors.accent : colors.danger }]}>
                {result ? 'Estimated result' : 'Check your inputs'}
              </Text>
              <Text style={[styles.resultValue, { color: colors.text }]}>{result?.value ?? '—'}</Text>
              {result ? <Text style={[styles.resultDetail, { color: colors.text3 }]}>{result.detail}</Text> : null}
            </View>
            <Pressable feedbackCategory="selection" onPress={reset} hitSlop={8}>
              <Ionicons name="refresh" size={18} color={colors.text3} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  heroIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 16, letterSpacing: trackingFor(16), fontWeight: '800' },
  heroText: { fontSize: 12.5, letterSpacing: trackingFor(12.5), lineHeight: 17, marginTop: 2 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, minHeight: 46, fontSize: 14, letterSpacing: trackingFor(14) },
  chips: { gap: spacing.sm, paddingRight: spacing.xl },
  resultCountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultCount: { fontSize: 12, letterSpacing: trackingFor(12), fontWeight: '700' },
  planText: { fontSize: 12, letterSpacing: trackingFor(12) },
  toolList: { gap: spacing.sm },
  toolCard: { padding: 0, overflow: 'hidden' },
  toolHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  toolIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  toolTitle: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '700', flexShrink: 1 },
  toolSummary: { fontSize: 11.5, letterSpacing: trackingFor(11.5), lineHeight: 16, marginTop: 2 },
  tierPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  tierPillText: { fontSize: 9.5, letterSpacing: trackingFor(9.5, { uppercase: true }), fontWeight: '800', textTransform: 'uppercase' },
  calculator: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: spacing.md },
  inputsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  inputField: { flexGrow: 1, flexBasis: '46%' },
  inputLabel: { fontSize: 11, letterSpacing: trackingFor(11), fontWeight: '600', marginBottom: 5 },
  inputWrap: { minHeight: 42, flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  numberInput: { flex: 1, minWidth: 48, fontSize: 14, letterSpacing: trackingFor(14), paddingVertical: spacing.sm },
  affix: { fontSize: 12, letterSpacing: trackingFor(12), fontWeight: '600' },
  resultBox: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
  resultLabel: { fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  resultValue: { fontSize: 22, letterSpacing: trackingFor(22), fontWeight: '800', marginTop: 2 },
  resultDetail: { fontSize: 11.5, letterSpacing: trackingFor(11.5), lineHeight: 16, marginTop: 3 },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '700' },
  disclaimer: { fontSize: 10.5, letterSpacing: trackingFor(10.5), lineHeight: 15, textAlign: 'center', marginTop: spacing.sm },
});

