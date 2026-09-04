import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore } from '@/store/useSettingsStore';

// Gates all app content behind Face ID/fingerprint when the user has turned
// biometric lock on in Settings. Web has no biometric APIs and no
// backgrounding concept the same way, so this is a no-op passthrough there
// (see useSettingsStore's biometricLockEnabled, only ever settable where
// hasHardwareAsync() says the device supports it).
export function AppLockGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const enabled = useSettingsStore((s) => s.biometricLockEnabled);
  const [locked, setLocked] = useState(enabled);
  const [authenticating, setAuthenticating] = useState(false);
  const authenticatingRef = useRef(false);
  const appState = useRef(AppState.currentState);

  const attemptUnlock = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    setAuthenticating(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock to continue' });
      if (result.success) setLocked(false);
    } catch {
      // Leave the lock screen up — the visible "Unlock" button lets the
      // person retry.
    } finally {
      authenticatingRef.current = false;
      setAuthenticating(false);
    }
  }, []);

  // Re-lock whenever the setting itself changes (turned on, or an
  // already-locked session turns it off).
  useEffect(() => {
    setLocked(enabled);
  }, [enabled]);

  // Re-lock on backgrounding, so switching apps or the app switcher can't
  // be used to skip the lock screen.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (next) => {
      const wasActive = appState.current === 'active';
      appState.current = next;
      if (wasActive && next !== 'active' && !authenticatingRef.current) setLocked(true);
    });
    return () => sub.remove();
  }, [enabled]);

  // Prompt immediately whenever a lock takes effect.
  useEffect(() => {
    if (locked && enabled) attemptUnlock();
  }, [locked, enabled, attemptUnlock]);

  if (!enabled || !locked) return <>{children}</>;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
      <View style={styles.center}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={[styles.title, { color: colors.text }]}>App locked</Text>
        <Text style={[styles.subtitle, { color: colors.text3 }]}>Authenticate to continue.</Text>
        <View style={{ marginTop: spacing.xl, alignSelf: 'stretch' }}>
          <Button label="Unlock" fullWidth onPress={attemptUnlock} loading={authenticating} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icon: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: '700', marginTop: spacing.md },
  subtitle: { fontSize: 13, marginTop: spacing.xs, textAlign: 'center' },
});
