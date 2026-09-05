import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import * as duelsApi from '@/services/social/duels';
import { useToastStore } from '@/store/useToastStore';

const DURATIONS: { value: string; label: string }[] = [
  { value: '3', label: '3 days' },
  { value: '7', label: '1 week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: '1 month' },
];

export default function NewDuelScreen() {
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const params = useLocalSearchParams<{
    kind: 'friend' | 'family';
    opponentId?: string;
    opponentName?: string;
  }>();

  const [duration, setDuration] = useState('7');
  const [opponentCode, setOpponentCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    setBusy(true);
    const days = Number(duration);
    const result =
      params.kind === 'friend' ? await duelsApi.challengeFriend(params.opponentId!, days) : await duelsApi.challengeFamily(opponentCode.trim(), days);
    setBusy(false);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    router.replace(`/markets/portfolio/social/duel/${result.id}`);
  }

  const ready = params.kind === 'friend' ? !!params.opponentId : opponentCode.trim().length > 0;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <Card style={{ gap: spacing.sm }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {params.kind === 'friend' ? `Challenge ${params.opponentName}` : 'Challenge another family'}
          </Text>
          <Text style={[styles.body, { color: colors.text2 }]}>
            Whoever grows their portfolio's net worth the most, in percentage terms, over the duel window wins. Everyone
            keeps trading in their normal Portfolio tab — nothing else changes.
          </Text>

          {params.kind === 'family' ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={[styles.label, { color: colors.text3 }]}>Their family's invite code</Text>
              <TextInput
                value={opponentCode}
                onChangeText={setOpponentCode}
                placeholder="Invite code"
                placeholderTextColor={colors.text3}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
            </View>
          ) : null}

          <Text style={[styles.label, { color: colors.text3 }]}>Duration</Text>
          <SegmentedControl options={DURATIONS} value={duration} onChange={setDuration} />

          <Button label="Send challenge" loading={busy} disabled={!ready} onPress={handleCreate} />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: spacing.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
});
