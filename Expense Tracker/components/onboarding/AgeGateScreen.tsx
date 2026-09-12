import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { createElement, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { MINIMUM_AGE, TEEN_RESTRICTIONS } from '@/constants/ageCompliance';
import { triggerFeedback } from '@/constants/animations';
import { JUDGE_MODE_PROMISE } from '@/constants/judgeMode';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useAgeGateStage } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import { useAgeStore } from '@/store/useAgeStore';
import { formatShortDate, parseDateLocal, toDateStr } from '@/utils/date';

// Runs ahead of onboarding and cannot be skipped — see app/_layout.tsx.
//
// Deliberately a neutral age screen: it asks for a date of birth outright
// rather than "are you over 13?", because a yes/no question telegraphs the
// answer that gets you in. Nothing is pre-filled and Continue stays disabled
// until a date is actually chosen, so no default answer can be committed by
// tapping through.
//
// No entrance animations anywhere in this file. Every step here is a
// decision point with a button on it, and CLAUDE.md §7 rule #2 exists
// because a view mid-`entering=` animation drops its first taps.

export function AgeGateScreen() {
  const stage = useAgeGateStage();

  if (stage === 'judge-check') return <JudgeModeStep />;
  if (stage === 'blocked') return <BlockedStep />;
  if (stage === 'ai-consent') return <AiConsentStep />;
  return <BirthDateStep />;
}

// TEMPORARY — Shipaton hackathon judging only, see constants/judgeMode.ts for
// what this is and how to remove it. Shown before the age gate because
// answering yes is what makes the age question unnecessary.
function JudgeModeStep() {
  const { colors } = useTheme();
  const setJudgeMode = useAgeStore((s) => s.setJudgeMode);

  return (
    <GateShell>
      <IconBadge name="ribbon-outline" tone={colors.accent} />
      <Text style={[styles.eyebrow, { color: colors.accent }]}>Shipaton</Text>
      <Text style={[styles.title, { color: colors.text }]}>Are you a judge?</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Markva is a RevenueCat Shipaton entry. If you are judging it, you can unlock every plan through RevenueCat
        Test Store so you can review the whole app without paying or answering personal questions.
      </Text>

      <View style={styles.list}>
        {JUDGE_MODE_PROMISE.map((line) => (
          <View key={line} style={styles.listRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} style={styles.listIcon} />
            <Text style={[styles.listText, { color: colors.text2 }]}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.note, { backgroundColor: colors.surface2 }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.text3} />
        <Text style={[styles.noteText, { color: colors.text2 }]}>
          This is a temporary judging option and will be removed once the hackathon is over. If you are not a judge,
          tap below and the app will set up normally.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button label="Yes, I'm a judge" fullWidth onPress={() => setJudgeMode(true)} />
        <Button label="No, I'm a regular user" variant="ghost" fullWidth onPress={() => setJudgeMode(false)} />
      </View>
    </GateShell>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </SafeAreaView>
  );
}

function IconBadge({ name, tone }: { name: keyof typeof Ionicons.glyphMap; tone: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
      <Ionicons name={name} size={28} color={tone} />
    </View>
  );
}

function BirthDateStep() {
  const { colors } = useTheme();
  const setBirthDate = useAgeStore((s) => s.setBirthDate);
  const [picked, setPicked] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // A neutral starting position for the spinner: old enough not to read as a
  // suggestion to claim adulthood, recent enough not to make every teen
  // scroll a decade. It is only ever a starting position — nothing is
  // committed unless the user actually picks.
  const initialDate = new Date();
  initialDate.setFullYear(initialDate.getFullYear() - 20);

  const oldest = new Date();
  oldest.setFullYear(oldest.getFullYear() - 120);

  return (
    <GateShell>
      <IconBadge name="calendar-outline" tone={colors.accent} />
      <Text style={[styles.eyebrow, { color: colors.accent }]}>One quick thing</Text>
      <Text style={[styles.title, { color: colors.text }]}>What&apos;s your date of birth?</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Markva asks so it can apply the right privacy protections to your account. Your date of birth is stored on
        this phone and nothing else — it is never uploaded, never shared, and never attached to anything you do in
        the app.
      </Text>

      <Pressable
        onPressIn={() => triggerFeedback('selection')}
        onPress={() => setShowPicker((v) => !v)}
        style={[styles.dateField, { borderColor: picked ? colors.accent : colors.border, backgroundColor: colors.surface2 }]}>
        <Ionicons name="calendar" size={18} color={picked ? colors.accent : colors.text3} />
        <Text style={[styles.dateFieldLabel, { color: picked ? colors.text : colors.text3 }]}>
          {picked ? formatShortDate(picked) : 'Select your date of birth'}
        </Text>
      </Pressable>

      {showPicker ? (
        Platform.OS === 'web' ? (
          <View style={[styles.webDatePicker, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
            {createElement('input', {
              type: 'date',
              'aria-label': 'Date of birth',
              value: picked ?? '',
              min: toDateStr(oldest),
              max: toDateStr(new Date()),
              autoFocus: true,
              onChange: (event: { currentTarget: { value: string } }) => {
                if (event.currentTarget.value) setPicked(event.currentTarget.value);
              },
              style: {
                width: '100%',
                border: 0,
                outline: 0,
                background: 'transparent',
                color: colors.text,
                fontFamily: 'inherit',
                fontSize: 16,
                colorScheme: colors.bg === '#000000' ? 'dark' : 'light',
              },
            })}
          </View>
        ) : (
          <DateTimePicker
            value={picked ? parseDateLocal(picked) : initialDate}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            minimumDate={oldest}
            onChange={(event, selected) => {
              if (event.type === 'dismissed') {
                setShowPicker(false);
                return;
              }
              if (selected) setPicked(toDateStr(selected));
              if (Platform.OS !== 'ios') setShowPicker(false);
            }}
          />
        )
      ) : null}

      <View style={styles.actions}>
        <Button label="Continue" fullWidth disabled={!picked} onPress={() => picked && setBirthDate(picked)} />
      </View>
    </GateShell>
  );
}

function BlockedStep() {
  const { colors } = useTheme();
  return (
    <GateShell>
      <IconBadge name="lock-closed-outline" tone={colors.warning} />
      <Text style={[styles.eyebrow, { color: colors.warning }]}>Not available yet</Text>
      <Text style={[styles.title, { color: colors.text }]}>Markva is for ages {MINIMUM_AGE} and up</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Based on the date of birth you entered, you are not old enough to use Markva yet. Nothing you entered has
        been saved anywhere except this phone, and no account has been created.
      </Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        We would rather turn you away than collect anything from you without a parent&apos;s permission, which this
        app has no way to ask for. Come back when you turn {MINIMUM_AGE}.
      </Text>
      <View style={[styles.note, { backgroundColor: colors.surface2 }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.text3} />
        <Text style={[styles.noteText, { color: colors.text2 }]}>
          Entered the wrong date? This answer cannot be changed from inside the app — reinstall Markva to enter it
          again.
        </Text>
      </View>
    </GateShell>
  );
}

function AiConsentStep() {
  const { colors } = useTheme();
  const setAiDataConsent = useAgeStore((s) => s.setAiDataConsent);

  return (
    <GateShell>
      <IconBadge name="shield-checkmark-outline" tone={colors.accent} />
      <Text style={[styles.eyebrow, { color: colors.accent }]}>Your privacy</Text>
      <Text style={[styles.title, { color: colors.text }]}>A few things work differently for under-18s</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Everything that actually teaches you about investing stays exactly the same: paper trading, lessons,
        quizzes, charts, budgets and goals. These are the parts we switch off, and they stay off no matter what
        plan you are on:
      </Text>

      <View style={styles.list}>
        {TEEN_RESTRICTIONS.map((line) => (
          <View key={line} style={styles.listRow}>
            <Ionicons name="close-circle" size={16} color={colors.text3} style={styles.listIcon} />
            <Text style={[styles.listText, { color: colors.text2 }]}>{line}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.subheading, { color: colors.text }]}>One thing you get to decide</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        The AI features — the Assistant, quiz generation, lesson stories and headline explanations — work by sending
        what you type to an outside AI company (Google, Anthropic, OpenAI or OpenRouter, depending on your
        settings). That means your questions leave your phone.
      </Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Saying no turns those features off and changes nothing else. You can change your mind either way in Settings
        whenever you like.
      </Text>

      <View style={styles.actions}>
        <Button label="Turn on AI features" fullWidth onPress={() => setAiDataConsent(true)} />
        <Button label="No, keep AI off" variant="ghost" fullWidth onPress={() => setAiDataConsent(false)} />
      </View>
    </GateShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: spacing.xl * 2 },
  iconBadge: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.lg },
  title: { fontSize: 26, fontWeight: '700', marginTop: spacing.sm, letterSpacing: -0.4 },
  subheading: { fontSize: 16, letterSpacing: trackingFor(16), fontWeight: '700', marginTop: spacing.xl },
  body: { fontSize: 14, letterSpacing: trackingFor(14), lineHeight: 20, marginTop: spacing.sm },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginTop: spacing.xl,
  },
  dateFieldLabel: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '600', flexShrink: 1 },
  webDatePicker: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginTop: spacing.sm,
  },
  list: { marginTop: spacing.lg, gap: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  listIcon: { marginTop: 2 },
  listText: { fontSize: 13.5, letterSpacing: trackingFor(13.5), lineHeight: 19, flex: 1 },
  note: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.xl,
  },
  noteText: { flex: 1, fontSize: 12.5, letterSpacing: trackingFor(12.5), lineHeight: 18 },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
