import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { radius, spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { getQuote } from '@/services/marketData/mockMarketData';
import { MAX_PORTFOLIOS, type PortfolioData, usePortfolioStore } from '@/store/usePortfolioStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import { confirmAction } from '@/utils/confirm';
import { money } from '@/utils/money';

function netWorthOf(p: PortfolioData): number {
  let value = p.cash;
  for (const h of Object.values(p.holdings)) value += getQuote(h.symbol).price * h.qty;
  return value;
}

function PortfolioRow({ portfolio, isActive }: { portfolio: PortfolioData; isActive: boolean }) {
  const { colors } = useTheme();
  const { switchPortfolio, renamePortfolio, deletePortfolio } = usePortfolioStore();
  const portfolioCount = usePortfolioStore((s) => Object.keys(s.portfolios).length);
  const showToast = useToastStore((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(portfolio.name);
  const netWorth = useMemo(() => netWorthOf(portfolio), [portfolio]);

  function saveRename() {
    renamePortfolio(portfolio.id, nameInput);
    setEditing(false);
  }

  function handleDelete() {
    confirmAction(
      { title: `Delete "${portfolio.name}"?`, message: 'This clears its cash, holdings, and trade history for good.', confirmLabel: 'Delete', destructive: true },
      () => {
        const result = deletePortfolio(portfolio.id);
        if (!result.ok) showToast(result.message);
      }
    );
  }

  if (editing) {
    return (
      <Card style={[styles.row, isActive && { borderColor: colors.accent, borderWidth: 1.5 }]}>
        <TextInput
          value={nameInput}
          onChangeText={setNameInput}
          autoFocus
          style={[styles.nameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
        />
        <Button label="Save" onPress={saveRename} />
      </Card>
    );
  }

  return (
    <Card style={[styles.row, isActive && { borderColor: colors.accent, borderWidth: 1.5 }]}>
      <Pressable style={{ flex: 1 }} disabled={isActive} onPress={() => switchPortfolio(portfolio.id)}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: colors.text }]}>{portfolio.name}</Text>
          {isActive ? <PillBadge label="Active" /> : null}
        </View>
        <Text style={[styles.netWorth, { color: colors.text2 }]}>{money(netWorth)} net worth</Text>
      </Pressable>
      <View style={styles.actions}>
        <IconButton name="pencil-outline" size={15} onPress={() => setEditing(true)} />
        {portfolioCount > 1 ? <IconButton name="trash-outline" size={15} onPress={handleDelete} /> : null}
      </View>
    </Card>
  );
}

export default function ManagePortfoliosScreen() {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const upgradeToTier = useUpgradeToTier();
  const { portfolios, activePortfolioId, createPortfolio } = usePortfolioStore();
  const showToast = useToastStore((s) => s.show);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const list = useMemo(() => Object.values(portfolios).sort((a, b) => a.name.localeCompare(b.name)), [portfolios]);
  const atCap = list.length >= MAX_PORTFOLIOS;

  function handleCreate() {
    const result = createPortfolio(newName);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    setNewName('');
    setCreating(false);
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
      {list.map((p) => (
        <PortfolioRow key={p.id} portfolio={p} isActive={p.id === activePortfolioId} />
      ))}

      {!features.multiplePortfolios ? (
        <Card style={styles.locked}>
          <View style={styles.cardHead}>
            <Text style={[styles.lockedTitle, { color: colors.text }]}>More portfolios</Text>
            <Ionicons name="lock-closed" size={16} color={colors.text3} />
          </View>
          <Text style={[styles.lockedBody, { color: colors.text3 }]}>
            Max unlocks up to {MAX_PORTFOLIOS} paper-trading portfolios, so you can run separate strategies side by side.
          </Text>
          <Button label="Upgrade to Max" variant="ghost" onPress={() => upgradeToTier('max')} />
        </Card>
      ) : creating ? (
        <Card style={{ gap: spacing.md }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Portfolio name"
            placeholderTextColor={colors.text3}
            autoFocus
            style={[styles.nameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          />
          <View style={styles.createRow}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="ghost" fullWidth onPress={() => setCreating(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Create" fullWidth onPress={handleCreate} />
            </View>
          </View>
        </Card>
      ) : (
        <Button
          label={atCap ? `Portfolio limit reached (${MAX_PORTFOLIOS})` : '+ New portfolio'}
          variant="ghost"
          fullWidth
          disabled={atCap}
          onPress={() => setCreating(true)}
        />
      )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 15, fontWeight: '700' },
  netWorth: { fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  nameInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  createRow: { flexDirection: 'row', gap: spacing.md },
  locked: { gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lockedTitle: { fontSize: 15, fontWeight: '700' },
  lockedBody: { fontSize: 12.5, lineHeight: 17 },
});
