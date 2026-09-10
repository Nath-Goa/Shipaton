import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useAgePermissions } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/useAuthStore';

// Unlike the deleted app-wide AuthGate (see CLAUDE.md §5.8's history note),
// this gates only the social screens it's rendered inside of — the rest of
// the app stays fully usable with no account at all. No email-code step:
// "Confirm email" is off in the Supabase dashboard for this project, so
// signUp logs straight in (see store/useAuthStore.ts).
type Step = 'sign-in' | 'sign-up' | 'reset' | 'reset-sent';

export function SocialAuthGate() {
  const { colors } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);
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

  const title = step === 'sign-in' ? 'Sign in for social' : step === 'sign-up' ? 'Create an account' : 'Reset password';

  return (
    <View style={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.body, { color: colors.text2 }]}>
        Friends, families, and duels need a real account so someone else can find and challenge you — everything else
        in the app still works with no account at all.
      </Text>

      {step === 'sign-in' || step === 'sign-up' ? (
        <>
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
          {step === 'sign-in' ? (
            <>
              <Pressable onPress={() => setStep('reset')}>
                <Text style={[styles.link, { color: colors.accent }]}>Forgot password?</Text>
              </Pressable>
              <Pressable onPress={() => setStep('sign-up')}>
                <Text style={[styles.link, { color: colors.text2 }]}>New here? Create an account</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setStep('sign-in')}>
              <Text style={[styles.link, { color: colors.text2 }]}>Already have an account? Sign in</Text>
            </Pressable>
          )}
        </>
      ) : step === 'reset' ? (
        <>
          <Text style={[styles.body, { color: colors.text2 }]}>Enter your email and we'll send a link to reset your password.</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.text3}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
          />
          {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
          <Button label="Send reset link" fullWidth loading={busy} disabled={!email} onPress={() => run(() => requestPasswordReset(email), () => setStep('reset-sent'))} />
          <Pressable onPress={() => setStep('sign-in')}>
            <Text style={[styles.link, { color: colors.text2 }]}>Back to sign in</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={[styles.body, { color: colors.text2 }]}>Check {email} for a reset link, then come back and sign in with your new password.</Text>
          <Button label="Back to sign in" fullWidth onPress={() => setStep('sign-in')} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 13.5, lineHeight: 19 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
  },
  error: { fontSize: 12.5, fontWeight: '600' },
  link: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: spacing.sm },
});
