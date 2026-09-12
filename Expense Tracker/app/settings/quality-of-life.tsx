import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useQolStore, type LoadingGame } from '@/store/useQolStore';

const GAME_OPTIONS = [
  { value: 'flappy', label: 'Flappy' },
  { value: 'market-match', label: 'Market Match' },
];

export default function QualityOfLifeScreen() {
  const { colors } = useTheme();
  const settings = useQolStore(useShallow((state) => state));

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Quality of Life' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.text3 }]}>Tune the small interactions that make Markva feel like yours.</Text>
        <ToggleCard label="Haptic feedback" description="Vibrate gently for taps, success, and warnings." value={settings.hapticsEnabled} onChange={settings.setHapticsEnabled} />
        <ToggleCard label="Interface sounds" description="Play short sounds for navigation and actions." value={settings.soundsEnabled} onChange={settings.setSoundsEnabled} />
        <ToggleCard label="Reduced motion" description="Skip slides, springs and bounces app-wide. Buttons still respond, and dragging still follows your finger." value={settings.reducedMotion} onChange={settings.setReducedMotion} />
        <ToggleCard label="Hide balances" description="Mask money values on Home when privacy matters." value={settings.hideBalances} onChange={settings.setHideBalances} />
        <ToggleCard label="Games while waiting" description="Show an optional mini-game during longer AI waits." value={settings.loadingGamesEnabled} onChange={settings.setLoadingGamesEnabled} />
        {settings.loadingGamesEnabled ? (
          <Card>
            <Text style={[styles.label, { color: colors.text }]}>Preferred loading game</Text>
            <Text style={[styles.description, { color: colors.text3 }]}>You can switch games without restarting the app.</Text>
            <View style={{ marginTop: spacing.md }}>
              <SegmentedControl options={GAME_OPTIONS} value={settings.loadingGame} onChange={(value) => settings.setLoadingGame(value as LoadingGame)} />
            </View>
          </Card>
        ) : null}
        <ToggleCard label="Remember my place" description="Restore supported lists and feeds near their previous position." value={settings.rememberScroll} onChange={settings.setRememberScroll} />
      </ScrollView>
    </Screen>
  );
}

function ToggleCard({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.description, { color: colors.text3 }]}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent }} />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { fontSize: 13, letterSpacing: trackingFor(13), lineHeight: 18, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '700' },
  description: { fontSize: 12, letterSpacing: trackingFor(12), lineHeight: 16, marginTop: 2 },
});

