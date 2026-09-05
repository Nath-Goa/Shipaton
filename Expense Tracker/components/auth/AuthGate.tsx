import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/store/useAuthStore';

// Rendered in place of the main app (see app/_layout.tsx) whenever Supabase
// is configured and there's no active session — a single plain component
// with internal step state, the same shape as OnboardingScreen, rather than
// a separate expo-router Stack: this gate has to sit *outside* the router's
// normal tree (nothing behind it should be reachable), so it doesn't need
// real routes of its own.
type Step = 'sign-in' | 'sign-up' | 'verify' | 'reset' | 'reset-sent';

export function AuthGate() {
  const { colors } = useTheme();
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const verifyEmailCode = useAuthStore((s) => s.verifyEmailCode);
  const resendCode = useAuthStore((s) => s.resendCode);
  const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);

  const [step, setStep] = useState<Step>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
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

  const title =
    step === 'sign-in' ? 'Sign in' : step === 'sign-up' ? 'Create account' : step === 'verify' ? 'Check your email' : 'Reset password';

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.content}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

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
                  step === 'sign-in'
                    ? run(() => signIn(email, password), () => undefined)
                    : run(() => signUp(email, password), () => setStep('verify'))
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
          ) : step === 'verify' ? (
            <>
              <Text style={[styles.body, { color: colors.text2 }]}>
                We emailed a 6-digit code to {email}. Enter it below to verify your account.
              </Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={colors.text3}
                keyboardType="number-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button
                label="Verify"
                fullWidth
                loading={busy}
                disabled={code.length < 4}
                onPress={() => run(() => verifyEmailCode(email, code), () => undefined)}
              />
              <Pressable onPress={() => run(() => resendCode(email), () => setError('Code resent.'))}>
                <Text style={[styles.link, { color: colors.text2 }]}>Resend code</Text>
              </Pressable>
            </>
          ) : step === 'reset' ? (
            <>
              <Text style={[styles.body, { color: colors.text2 }]}>
                Enter your email and we'll send a link to reset your password.
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
              {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              <Button
                label="Send reset link"
                fullWidth
                loading={busy}
                disabled={!email}
                onPress={() => run(() => requestPasswordReset(email), () => setStep('reset-sent'))}
              />
              <Pressable onPress={() => setStep('sign-in')}>
                <Text style={[styles.link, { color: colors.text2 }]}>Back to sign in</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.body, { color: colors.text2 }]}>
                Check {email} for a reset link, then come back and sign in with your new password.
              </Text>
              <Button label="Back to sign in" fullWidth onPress={() => setStep('sign-in')} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '700', marginBottom: spacing.sm },
  body: { fontSize: 13.5, lineHeight: 20 },
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
