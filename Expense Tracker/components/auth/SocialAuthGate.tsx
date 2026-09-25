import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useAgePermissions } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/useAuthStore';

// Unlike the deleted app-wide AuthGate (see CLAUDE.md §5.8's history note),
// this gates only the social screens it's rendered inside of — the rest of
// the app stays fully usable with no account at all. No email-code step:
// "Confirm email" is off in the Supabase dashboard for this project, so
// signUp logs straight in (see store/useAuthStore.ts). No password-reset
// flow either: Supabase's built-in mailer only delivers to the project's own
// team members, so a reset link would never reach a real user.
type Step = 'sign-in' | 'sign-up';

export function SocialAuthGate() {
  const { colors } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const agePermissions = useAgePermissions();

  const [step, setStep] = useState<Step>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, onOk: () => void) {
    setError(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'Something went wrong.');
      return;
    }
    onOk();
  }

  // The last line of defence on account creation. The social index screen
  // blocks minors before they ever reach this component, but this is the only
  // place in the app where a sign-up can actually happen, so the rule is
  // enforced here too rather than trusting every future caller to remember.
  if (!agePermissions.socialAccounts) {
    return (
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Accounts are 18+</Text>
        <Text style={[styles.body, { color: colors.text2 }]}>
          Markva only creates accounts for adults, because an account stores your email address and makes you
          findable by other people. Nothing else in the app needs one.
        </Text>
      </View>
    );
  }

  const title = step === 'sign-in' ? 'Sign in for social' : 'Create an account';

  return (
    <View style={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Friends, families, and duels need a real account so someone else can find and challenge you — everything else
        in the app still works with no account at all.
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor={colors.text3}
        autoCapitalize="none"
        keyboardType="email-address"
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.text3}
        secureTextEntry
        autoCapitalize="none"
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <Button
        label={step === 'sign-in' ? 'Sign in' : 'Create account'}
        fullWidth
        loading={busy}
        disabled={!email || !password}
        onPress={() =>
          step === 'sign-in' ? run(() => signIn(email, password), () => undefined) : run(() => signUp(email, password), () => undefined)
        }
      />
      <Pressable onPress={() => setStep(step === 'sign-in' ? 'sign-up' : 'sign-in')}>
        <Text style={[styles.link, { color: colors.text2 }]}>
          {step === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 20, letterSpacing: trackingFor(20), fontWeight: '700' },
  body: { fontSize: 13.5, letterSpacing: trackingFor(13.5), lineHeight: 19 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    letterSpacing: trackingFor(14),
  },
  error: { fontSize: 12.5, letterSpacing: trackingFor(12.5), fontWeight: '600' },
  link: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '600', textAlign: 'center', marginTop: spacing.sm },
});
