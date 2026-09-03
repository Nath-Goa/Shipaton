import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentColorPicker } from '@/components/settings/AccentColorPicker';
import { ApiKeySection } from '@/components/settings/ApiKeySection';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';
import { TICKERS } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore, type ThemeMode } from '@/store/useSettingsStore';

type Step = 'theme' | 'key' | 'stocks';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function OnboardingScreen() {
  const { colors } = useTheme();
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const [step, setStep] = useState<Step>('theme');

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
      {step === 'theme' ? (
        <Animated.View entering={FadeInRight.duration(350)} style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>Welcome</Text>
          <Text style={[styles.title, { color: colors.text }]}>Make it yours</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>
            Pick a look — you can change this anytime later in Settings.
          </Text>
          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <SegmentedControl options={THEME_OPTIONS} value={themeMode} onChange={setThemeMode} />
            <AccentColorPicker value={accentColor} onChange={setAccentColor} />
          </View>
          <View style={styles.actions}>
            <Button label="Continue" fullWidth onPress={() => setStep('key')} />
          </View>
        </Animated.View>
      ) : step === 'key' ? (
        <Animated.View entering={FadeInRight.duration(350)} style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>Welcome</Text>
          <Text style={[styles.title, { color: colors.text }]}>Set up your AI analyst</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>
            Add an API key so &quot;Ask the analyst&quot; and receipt auto-fill can work. Mock trading and expense
            tracking work fully without one — you can always add a key later in Settings.
          </Text>
          <View style={{ marginTop: spacing.xl }}>
            <ApiKeySection showHint={false} />
          </View>
          <View style={styles.actions}>
            <Button label="Continue" fullWidth onPress={() => setStep('stocks')} />
            <Button label="Skip for now" variant="ghost" fullWidth onPress={() => setStep('stocks')} />
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInRight.duration(350)} style={styles.flex}>
          <View style={styles.content}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>Mock stocks</Text>
            <Text style={[styles.title, { color: colors.text }]}>{TICKERS.length} stocks, ready to trade</Text>
            <Text style={[styles.subtitle, { color: colors.text2 }]}>
              Real symbols, simulated prices — start with $100,000 in paper money. No real brokerage, no real risk.
            </Text>
          </View>
          <FlatList
            data={TICKERS}
            keyExtractor={(t) => t.symbol}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).springify().damping(16)}>
                <View style={[styles.stockRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.stockSymbol, { color: colors.text }]}>{item.symbol}</Text>
                  <Text style={[styles.stockName, { color: colors.text3 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.stockSector, { color: colors.text3 }]}>{item.sector}</Text>
                </View>
              </Animated.View>
            )}
          />
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button label="Get started" fullWidth onPress={completeOnboarding} />
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 26, fontWeight: '700', marginTop: spacing.sm, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stockSymbol: { fontSize: 14, fontWeight: '700', width: 56 },
  stockName: { fontSize: 13, flex: 1 },
  stockSector: { fontSize: 11.5 },
  footer: { padding: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
});
