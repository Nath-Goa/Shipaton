import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { QtyStepperButton } from '@/components/ui/QtyStepperButton';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS, tickerOf } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import {
  DIFFICULTY_PROFILE,
  generatePricePath,
  portfolioValue,
  stepBot,
  type ArenaDifficulty,
  type ArenaPortfolio,
} from '@/services/arena/arenaEngine';
import { useSettingsStore } from '@/store/useSettingsStore';
import { hashString, mulberry32 } from '@/utils/prng';
import { money, signedMoney, signedPct } from '@/utils/money';

// A time-boxed, fast-forwardable head-to-head against a simple AI trader —
// deliberately its own self-contained sandbox (services/arena/arenaEngine.ts),
// never the real/mock market engine every other screen reads, and never
// wired to the price-direction predictor: this mode is about your own calls
// against an opponent, not a forecast telling you what to do.

const CASH_PRESETS = [10_000, 50_000, 100_000, 250_000];
const DURATION_PRESETS_MIN = [5, 15, 30, 60, 120, 300];
const UNIVERSE_SIZES = [4, 6, 8] as const;
const SPEED_OPTIONS = [1, 2, 5, 10] as const;
// A tick every 2 real seconds at 1x — total ticks are fixed by the chosen
// duration at 1x, so a higher speed just plays the same number of ticks out
// over less real time rather than simulating "more" market.
const TICK_INTERVAL_MS = 2000;
const SKIP_TICKS = 5;

type Phase = 'config' | 'live' | 'results';

export default function ArenaScreen() {
  const { colors } = useTheme();
  const tutorialSeen = useSettingsStore((s) => s.arenaTutorialSeen);
  const setTutorialSeen = useSettingsStore((s) => s.setArenaTutorialSeen);

  const [phase, setPhase] = useState<Phase>('config');
  const [showTutorial, setShowTutorial] = useState(!tutorialSeen);
  const [startingCash, setStartingCash] = useState(100_000);
  const [customCashText, setCustomCashText] = useState('');
  const [durationMin, setDurationMin] = useState(15);
  const [customDurationText, setCustomDurationText] = useState('');
  const [difficulty, setDifficulty] = useState<ArenaDifficulty>('balanced');
  const [universeSize, setUniverseSize] = useState<4 | 6 | 8>(6);
  const [speed, setSpeed] = useState<1 | 2 | 5 | 10>(1);

  const [tick, setTick] = useState(0);
  const [totalTicks, setTotalTicks] = useState(0);
  const [paths, setPaths] = useState<Record<string, number[]>>({});
  const [symbols, setSymbols] = useState<string[]>([]);
  const [user, setUser] = useState<ArenaPortfolio>({ cash: 0, holdings: {} });
  const [bot, setBot] = useState<ArenaPortfolio>({ cash: 0, holdings: {} });
  const botRandRef = useRef<() => number>(() => Math.random());
  const [selected, setSelected] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState('1');
  const [message, setMessage] = useState<string | null>(null);

  const finalCash = () => {
    const parsed = Number(customCashText);
    return customCashText && parsed > 0 ? Math.round(parsed) : startingCash;
  };
  const finalDuration = () => {
    const parsed = Number(customDurationText);
    return customDurationText && parsed > 0 ? Math.round(parsed) : durationMin;
  };

  function pricesAt(index: number): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of symbols) out[s] = paths[s]?.[index] ?? 0;
    return out;
  }

  function startSession() {
    const cash = finalCash();
    const minutes = finalDuration();
    const chosenSymbols = TICKERS.slice(0, universeSize).map((t) => t.symbol);
    const seed = `arena:${Date.now()}:${Math.random()}`;
    const ticks = Math.max(10, Math.round((minutes * 60 * 1000) / TICK_INTERVAL_MS));

    const nextPaths: Record<string, number[]> = {};
    for (const symbol of chosenSymbols) {
      const t = tickerOf(symbol);
      nextPaths[symbol] = generatePricePath(`${seed}:${symbol}`, t?.basePrice ?? 100, t?.volatility ?? 0.02, ticks);
    }

    botRandRef.current = mulberry32(hashString(seed));
    setSymbols(chosenSymbols);
    setPaths(nextPaths);
    setTotalTicks(ticks);
    setTick(0);
    setUser({ cash, holdings: {} });
    setBot({ cash, holdings: {} });
    setSelected(chosenSymbols[0] ?? null);
    setQtyText('1');
    setMessage(null);
    setPhase('live');
  }

  useEffect(() => {
    if (phase !== 'live') return;
    if (tick >= totalTicks) {
      setPhase('results');
      return;
    }
    const timer = setTimeout(() => {
      setTick((current) => {
        const next = current + 1;
        setBot((prevBot) =>
          stepBot(prevBot, symbols, pricesAt(next), pricesAt(current), DIFFICULTY_PROFILE[difficulty], botRandRef.current)
        );
        return next;
      });
    }, TICK_INTERVAL_MS / speed);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tick, totalTicks, speed]);

  function skipAhead() {
    triggerFeedback('secondary');
    setTick((current) => {
      let botState = bot;
      let t = current;
      const target = Math.min(totalTicks, current + SKIP_TICKS);
      while (t < target) {
        const nextT = t + 1;
        botState = stepBot(botState, symbols, pricesAt(nextT), pricesAt(t), DIFFICULTY_PROFILE[difficulty], botRandRef.current);
        t = nextT;
      }
      setBot(botState);
      return t;
    });
  }

  const currentPrices = pricesAt(tick);
  const userValue = portfolioValue(user, currentPrices);
  const botValue = portfolioValue(bot, currentPrices);
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const price = selected ? (currentPrices[selected] ?? 0) : 0;
  const owned = selected ? (user.holdings[selected]?.qty ?? 0) : 0;

  function trade(side: 'buy' | 'sell') {
    if (!selected || qty <= 0) return;
    setMessage(null);
    if (side === 'buy') {
      const cost = qty * price;
      if (cost > user.cash) {
        setMessage("That's more than your arena cash.");
        triggerFeedback('error');
        return;
      }
      triggerFeedback('success');
      setUser((prev) => {
        const existing = prev.holdings[selected];
        const newQty = (existing?.qty ?? 0) + qty;
        const newAvgCost = existing ? (existing.avgCost * existing.qty + cost) / newQty : price;
        return { cash: prev.cash - cost, holdings: { ...prev.holdings, [selected]: { qty: newQty, avgCost: newAvgCost } } };
      });
    } else {
      if (owned < qty) {
        setMessage("You don't own that many shares.");
        triggerFeedback('error');
        return;
      }
      triggerFeedback('success');
      setUser((prev) => {
        const existing = prev.holdings[selected]!;
        const remaining = existing.qty - qty;
        const holdings = { ...prev.holdings };
        if (remaining <= 0) delete holdings[selected];
        else holdings[selected] = { ...existing, qty: remaining };
        return { cash: prev.cash + qty * price, holdings };
      });
    }
  }

  function dismissTutorial() {
    setTutorialSeen();
    setShowTutorial(false);
  }

  const tutorialModal = (
    <Modal visible={showTutorial} animationType="fade" transparent onRequestClose={dismissTutorial}>
      <View style={styles.tutorialBackdrop}>
        <View style={[styles.tutorialCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.tutorialTitle, { color: colors.text }]}>$100k vs AI</Text>
          <Text style={[styles.tutorialBody, { color: colors.text2 }]}>
            Trade a short, fast-moving simulated market against an AI opponent with the same starting cash. Pick a
            duration and speed up time to play it out faster — the market keeps moving even while you're deciding.
            Whoever has the higher net worth when time runs out wins. This mode doesn't use the price predictor —
            it's just you against the bot.
          </Text>
          <Button label="Got it" fullWidth onPress={dismissTutorial} />
        </View>
      </View>
    </Modal>
  );

  if (phase === 'config') {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        {tutorialModal}
        <ScrollView contentContainerStyle={styles.configContent}>
          <Animated.View entering={FadeInDown.duration(250)} style={{ gap: spacing.lg }}>
            <Text style={[styles.title, { color: colors.text }]}>$100k vs AI</Text>
            <Text style={[styles.subtitle, { color: colors.text2 }]}>
              Set up a head-to-head trading session against an AI opponent.
            </Text>

            <Card>
              <Text style={[styles.label, { color: colors.text3 }]}>Starting cash</Text>
              <View style={styles.chipRow}>
                {CASH_PRESETS.map((c) => (
                  <Chip
                    key={c}
                    label={money(c)}
                    active={!customCashText && startingCash === c}
                    onPress={() => {
                      setCustomCashText('');
                      setStartingCash(c);
                    }}
                  />
                ))}
              </View>
              <TextInput
                value={customCashText}
                onChangeText={setCustomCashText}
                placeholder="Custom amount"
                placeholderTextColor={colors.text3}
                keyboardType="number-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Card>

            <Card>
              <Text style={[styles.label, { color: colors.text3 }]}>Duration</Text>
              <View style={styles.chipRow}>
                {DURATION_PRESETS_MIN.map((m) => (
                  <Chip
                    key={m}
                    label={m < 60 ? `${m}m` : `${m / 60}h`}
                    active={!customDurationText && durationMin === m}
                    onPress={() => {
                      setCustomDurationText('');
                      setDurationMin(m);
                    }}
                  />
                ))}
              </View>
              <TextInput
                value={customDurationText}
                onChangeText={setCustomDurationText}
                placeholder="Custom minutes"
                placeholderTextColor={colors.text3}
                keyboardType="number-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              />
            </Card>

            <Card>
              <Text style={[styles.label, { color: colors.text3 }]}>AI difficulty</Text>
              <View style={{ marginTop: spacing.sm }}>
                <SegmentedControl
                  options={(['cautious', 'balanced', 'aggressive'] as ArenaDifficulty[]).map((d) => ({
                    value: d,
                    label: DIFFICULTY_PROFILE[d].label,
                  }))}
                  value={difficulty}
                  onChange={(v) => setDifficulty(v as ArenaDifficulty)}
                />
              </View>
            </Card>

            <Card>
              <Text style={[styles.label, { color: colors.text3 }]}>Stocks in play</Text>
              <View style={{ marginTop: spacing.sm }}>
                <SegmentedControl
                  options={UNIVERSE_SIZES.map((n) => ({ value: String(n), label: `${n}` }))}
                  value={String(universeSize)}
                  onChange={(v) => setUniverseSize(Number(v) as 4 | 6 | 8)}
                />
              </View>
            </Card>

            <Button label="Start session" fullWidth onPress={startSession} />
          </Animated.View>
        </ScrollView>
      </Screen>
    );
  }

  if (phase === 'results') {
    const userWon = userValue > botValue;
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.resultsWrap}>
          <Ionicons name={userWon ? 'trophy' : 'sad-outline'} size={48} color={userWon ? colors.warning : colors.text3} />
          <Text style={[styles.resultsTitle, { color: colors.text }]}>{userWon ? 'You won!' : 'The AI won this one'}</Text>
          <View style={styles.resultsRow}>
            <StatTile label="You" value={money(userValue)} />
            <StatTile label="AI" value={money(botValue)} />
          </View>
          <Text style={[styles.resultsDelta, { color: userWon ? colors.success : colors.danger }]}>
            {signedMoney(userValue - botValue)} difference
          </Text>
          <Button label="Play again" fullWidth onPress={() => setPhase('config')} />
        </View>
      </Screen>
    );
  }

  // Live session.
  const progress = totalTicks > 0 ? tick / totalTicks : 0;
  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.liveContent}>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { backgroundColor: colors.accent, width: `${progress * 100}%` }]} />
        </View>

        <View style={styles.statsRow}>
          <StatTile label="You" value={money(userValue)} />
          <StatTile label="AI" value={money(botValue)} />
        </View>

        <View style={styles.speedRow}>
          <SegmentedControl
            options={SPEED_OPTIONS.map((s) => ({ value: String(s), label: `${s}x` }))}
            value={String(speed)}
            onChange={(v) => setSpeed(Number(v) as 1 | 2 | 5 | 10)}
          />
          <Button label="Skip ahead" variant="ghost" onPress={skipAhead} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.symbolRow}>
          {symbols.map((s) => {
            const t = tickerOf(s);
            const startPrice = paths[s]?.[0] ?? 0;
            const p = currentPrices[s] ?? 0;
            const pct = startPrice > 0 ? ((p - startPrice) / startPrice) * 100 : 0;
            return (
              <Chip
                key={s}
                label={`${s} ${money(p)} (${signedPct(pct)})`}
                active={selected === s}
                onPress={() => setSelected(s)}
              />
            );
          })}
        </ScrollView>

        {selected ? (
          <Card>
            <Text style={[styles.label, { color: colors.text3 }]}>
              {tickerOf(selected)?.name} · {money(price)}
            </Text>
            <View style={styles.qtyRow}>
              <QtyStepperButton label="−" onPress={() => setQtyText((v) => String(Math.max(1, (Number(v) || 1) - 1)))} />
              <TextInput
                value={qtyText}
                onChangeText={setQtyText}
                keyboardType="number-pad"
                style={[styles.qtyInput, { color: colors.text, borderColor: colors.border }]}
              />
              <QtyStepperButton label="+" onPress={() => setQtyText((v) => String((Number(v) || 0) + 1))} />
            </View>
            <Text style={[styles.ownedText, { color: colors.text3 }]}>
              Owned: {owned} · Cash: {money(user.cash)}
            </Text>
            {message ? <Text style={[styles.message, { color: colors.danger }]}>{message}</Text> : null}
            <View style={styles.tradeActions}>
              <Button label="Buy" onPress={() => trade('buy')} />
              <Button label="Sell" variant="danger" onPress={() => trade('sell')} />
            </View>
          </Card>
        ) : null}

        <Button label="End session now" variant="ghost" onPress={() => setPhase('results')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  configContent: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13.5, lineHeight: 19 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  liveContent: { flex: 1, padding: spacing.xl, gap: spacing.md },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%' },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  speedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  symbolRow: { flexGrow: 0 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  qtyInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 8,
  },
  ownedText: { fontSize: 12.5, marginTop: spacing.sm },
  message: { fontSize: 12.5, marginTop: spacing.sm },
  tradeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  resultsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  resultsTitle: { fontSize: 22, fontWeight: '700' },
  resultsRow: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  resultsDelta: { fontSize: 16, fontWeight: '700' },
  tutorialBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  tutorialCard: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, width: '100%' },
  tutorialTitle: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  tutorialBody: { fontSize: 13.5, lineHeight: 20 },
});
