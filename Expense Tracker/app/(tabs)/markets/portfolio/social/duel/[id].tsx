import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import * as duelsApi from '@/services/social/duels';
import { profilesByIds } from '@/services/social/friends';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import { money, signedPct } from '@/utils/money';

export default function DuelDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useToastStore((s) => s.show);
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];

  const [duel, setDuel] = useState<duelsApi.Duel | null | undefined>(undefined);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const myId = useAuthStore((s) => s.session?.user.id);

  const load = useCallback(async () => {
    if (!id) return;
    await duelsApi.finalizeDuelIfReady(id);
    const row = await duelsApi.getDuel(id);
    setDuel(row);
    if (row) {
      const profiles = await profilesByIds(row.participantIds);
      setNames(new Map([...profiles].map(([pid, p]) => [pid, p.displayName])));
    }
    // Let the other side see this device is still active — a live nudge on
    // every open, same "resolve/refresh on view" pattern as everything else
    // network-bound in this app rather than a background timer.
    if (row?.status === 'active') duelsApi.reportLiveNetWorth(id);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    return duelsApi.subscribeToDuel(id, (updated) => setDuel(updated));
  }, [id]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleAccept() {
    if (!id) return;
    setBusy(true);
    const result = await duelsApi.acceptDuel(id);
    setBusy(false);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    load();
  }

  async function handleDecline() {
    if (!id) return;
    setBusy(true);
    const result = await duelsApi.declineDuel(id);
    setBusy(false);
    if (!result.ok) showToast(result.message);
    load();
  }

  async function handleVoteEnd() {
    if (!id) return;
    setBusy(true);
    const result = await duelsApi.castTimeSkipVote(id);
    setBusy(false);
    if (!result.ok) showToast(result.message);
    load();
  }

  if (duel === undefined) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!duel || !myId) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={{ color: colors.text3 }}>Duel not found.</Text>
        </View>
      </Screen>
    );
  }

  const opponentIds = duel.participantIds.filter((pid) => pid !== myId);
  const iVoted = duel.timeSkipVotes.includes(myId);

  function rowFor(pid: string) {
    const base = duel!.baselineNetWorths[pid];
    const live = duel!.liveNetWorths[pid] ?? base;
    const pct = base ? ((live - base) / base) * 100 : 0;
    const isWinner = duel!.winnerId === pid;
    return { pid, name: names.get(pid) ?? '…', base, live, pct, isWinner };
  }

  const rows = duel.participantIds.map(rowFor).sort((a, b) => b.pct - a.pct);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}>
        {duel.status === 'pending' ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={[styles.title, { color: colors.text }]}>
              {duel.baselineNetWorths[myId] ? 'Waiting on the other side' : `${names.get(opponentIds[0]) ?? 'Someone'} challenged you`}
            </Text>
            {!duel.baselineNetWorths[myId] ? (
              <View style={styles.row}>
                <Button label="Accept" loading={busy} onPress={handleAccept} />
                <Button label="Decline" variant="ghost" loading={busy} onPress={handleDecline} />
              </View>
            ) : (
              <Text style={[styles.muted, { color: colors.text3 }]}>You've accepted — this starts once they respond too.</Text>
            )}
          </Card>
        ) : duel.status === 'declined' ? (
          <Card>
            <Text style={{ color: colors.text }}>This duel was declined.</Text>
          </Card>
        ) : (
          <>
            {duel.status === 'completed' ? (
              <Card style={[styles.banner, { borderColor: colors.accent }]}>
                <Ionicons name="trophy" size={20} color={colors.accent} />
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {duel.winnerId === myId ? 'You won!' : duel.winnerId ? `${names.get(duel.winnerId)} won.` : 'Duel over — no clear winner.'}
                </Text>
              </Card>
            ) : null}

            <Card style={{ padding: 0 }}>
              {rows.map((r, i) => (
                <View key={r.pid} style={[styles.listRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.row}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>{r.pid === myId ? 'You' : r.name}</Text>
                      {r.isWinner ? <PillBadge label="Winner" /> : null}
                    </View>
                    <Text style={[styles.muted, { color: colors.text3 }]}>{money(r.live)}</Text>
                  </View>
                  <Text style={{ color: r.pct >= 0 ? colors.success : colors.danger, fontWeight: '700', fontSize: 16 }}>{signedPct(r.pct)}</Text>
                </View>
              ))}
            </Card>

            {duel.status === 'active' ? (
              <Card style={{ gap: spacing.sm }}>
                <Text style={[styles.muted, { color: colors.text3 }]}>
                  Ends {duel.endsAt ? new Date(duel.endsAt).toLocaleDateString() : 'when everyone agrees to stop'}
                </Text>
                {features.duelTimeSkip ? (
                  <Button
                    label={iVoted ? `Waiting on others (${duel.timeSkipVotes.length}/${duel.participantIds.length})` : 'Vote to end now'}
                    variant="ghost"
                    disabled={iVoted}
                    loading={busy}
                    onPress={handleVoteEnd}
                  />
                ) : (
                  <Text style={[styles.muted, { color: colors.text3 }]}>Pro/Max can vote to end a duel early once everyone agrees.</Text>
                )}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 17, fontWeight: '700' },
  muted: { fontSize: 12.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
});
