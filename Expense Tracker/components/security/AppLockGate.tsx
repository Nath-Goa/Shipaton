import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import {
  authenticateWithBiometrics,
  getBiometricCapabilities,
  getPinLockoutRemainingMs,
  verifyPin,
  type BiometricCapabilities,
} from '@/services/security/appLock';
import { useSettingsStore } from '@/store/useSettingsStore';

export function AppLockGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const appLockEnabled = useSettingsStore((s) => s.appLockEnabled || s.biometricLockEnabled);
  const pinLength = useSettingsStore((s) => s.pinLength);
  const useBiometrics = useSettingsStore((s) => s.useBiometrics);
  const lockTrigger = useSettingsStore((s) => s.lockTrigger);

  const [locked, setLocked] = useState(appLockEnabled);
  const [enteredPin, setEnteredPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [biometrics, setBiometrics] = useState<BiometricCapabilities | null>(null);

  const authenticatingRef = useRef(false);
  const appState = useRef(AppState.currentState);
  const shakeTranslate = useSharedValue(0);

  // Check biometric capability
  useEffect(() => {
    getBiometricCapabilities().then(setBiometrics);
  }, []);

  const triggerShake = useCallback(() => {
    triggerFeedback('error');
    // A shake is exactly the oscillating motion §14 wants gated — the red
    // dots/error text already carry the "wrong" signal on their own.
    if (!reducedMotion) {
      shakeTranslate.value = withSequence(
        withTiming(-12, { duration: 50 }),
        withSpring(12, springs.snappy),
        withSpring(-8, springs.snappy),
        withSpring(8, springs.snappy),
        withSpring(0, springs.snappy)
      );
    }
  }, [shakeTranslate, reducedMotion]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeTranslate.value }],
  }));

  const attemptBiometricUnlock = useCallback(async () => {
    if (authenticatingRef.current || !useBiometrics) return;
    authenticatingRef.current = true;
    try {
      const success = await authenticateWithBiometrics('Unlock to continue');
      if (success) {
        triggerFeedback('success');
        setLocked(false);
        setEnteredPin('');
        setErrorMsg(null);
      }
    } finally {
      authenticatingRef.current = false;
    }
  }, [useBiometrics]);

  // Re-lock whenever the setting itself turns on/off
  useEffect(() => {
    setLocked(appLockEnabled);
    if (appLockEnabled) {
      setEnteredPin('');
      setErrorMsg(null);
    }
  }, [appLockEnabled]);

  // Manual lock trigger from settings
  useEffect(() => {
    if (lockTrigger > 0 && appLockEnabled) {
      setLocked(true);
      setEnteredPin('');
      setErrorMsg(null);
    }
  }, [lockTrigger, appLockEnabled]);

  // Re-lock on backgrounding
  useEffect(() => {
    if (!appLockEnabled) return;
    const sub = AppState.addEventListener('change', (next) => {
      const wasActive = appState.current === 'active';
      appState.current = next;
      if (wasActive && next !== 'active' && !authenticatingRef.current) {
        setLocked(true);
        setEnteredPin('');
        setErrorMsg(null);
      }
    });
    return () => sub.remove();
  }, [appLockEnabled]);

  // Prompt biometric unlock automatically when locked
  useEffect(() => {
    if (locked && appLockEnabled && useBiometrics) {
      attemptBiometricUnlock();
    }
  }, [locked, appLockEnabled, useBiometrics, attemptBiometricUnlock]);

  const handleKeyPress = useCallback(
    async (num: string) => {
      setErrorMsg(null);

      if (enteredPin.length < pinLength) {
        const next = enteredPin + num;
        setEnteredPin(next);

        if (next.length === pinLength) {
          const isValid = await verifyPin(next);
          if (isValid) {
            triggerFeedback('success');
            setLocked(false);
            setEnteredPin('');
          } else {
            triggerShake();
            const lockoutMs = getPinLockoutRemainingMs();
            setErrorMsg(
              lockoutMs > 0 ? `Too many attempts. Try again in ${Math.ceil(lockoutMs / 1000)}s.` : 'Incorrect PIN'
            );
            setTimeout(() => {
              setEnteredPin('');
            }, 300);
          }
        }
      }
    },
    [enteredPin, pinLength, triggerShake]
  );

  const handleDelete = useCallback(() => {
    setErrorMsg(null);
    setEnteredPin((p) => p.slice(0, -1));
  }, []);

  if (!appLockEnabled || !locked) return <>{children}</>;

  const hasBiometricBtn = biometrics?.isEnrolled && useBiometrics;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.centerContent}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="lock-closed" size={32} color={colors.accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>App Locked</Text>
        <Text style={[styles.subtitle, { color: colors.text3 }]}>
          {hasBiometricBtn
            ? `Use ${biometrics?.label} or enter your PIN`
            : `Enter your ${pinLength}-digit PIN`}
        </Text>

        {/* PIN Dots */}
        <Animated.View style={[styles.dotsRow, shakeStyle]}>
          {Array.from({ length: pinLength }).map((_, i) => {
            const isFilled = i < enteredPin.length;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    borderColor: errorMsg ? colors.danger : colors.accent,
                    backgroundColor: isFilled
                      ? errorMsg
                        ? colors.danger
                        : colors.accent
                      : 'transparent',
                  },
                ]}
              />
            );
          })}
        </Animated.View>

        {errorMsg ? <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text> : null}

        {/* Numeric Keypad */}
        <View style={styles.keypad}>
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
            [hasBiometricBtn ? 'bio' : '', '0', 'del'],
          ].map((row, rowIdx) => (
            <View key={rowIdx} style={styles.keypadRow}>
              {row.map((btn, colIdx) => {
                if (btn === '') {
                  return <View key={colIdx} style={styles.keyEmpty} />;
                }
                if (btn === 'del') {
                  return (
                    <Pressable
                      key={colIdx}
                      hitSlop={10}
                      onPressIn={() => triggerFeedback('secondary')}
                      onPress={handleDelete}
                      disabled={enteredPin.length === 0}
                      style={({ pressed }) => [
                        styles.keyBtn,
                        { opacity: pressed ? 0.6 : enteredPin.length === 0 ? 0.3 : 1 },
                      ]}>
                      <Ionicons name="backspace-outline" size={24} color={colors.text} />
                    </Pressable>
                  );
                }
                if (btn === 'bio') {
                  return (
                    <Pressable
                      key={colIdx}
                      hitSlop={10}
                      onPress={attemptBiometricUnlock}
                      style={({ pressed }) => [
                        styles.keyBtn,
                        {
                          backgroundColor: pressed ? colors.surface2 : 'transparent',
                          borderColor: colors.border,
                        },
                      ]}>
                      <Ionicons
                        name={biometrics?.biometricType === 'face' ? 'scan-outline' : 'finger-print-outline'}
                        size={26}
                        color={colors.accent}
                      />
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={colIdx}
                    hitSlop={6}
                    onPressIn={() => triggerFeedback('selection')}
                    onPress={() => handleKeyPress(btn)}
                    style={({ pressed }) => [
                      styles.keyBtn,
                      {
                        backgroundColor: pressed ? colors.surface2 : 'transparent',
                        borderColor: colors.border,
                      },
                    ]}>
                    <Text style={[styles.keyText, { color: colors.text }]}>{btn}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 22, letterSpacing: trackingFor(22), fontWeight: '700' },
  subtitle: { fontSize: 13.5, letterSpacing: trackingFor(13.5), marginTop: spacing.xs, textAlign: 'center' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  errorText: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '600', marginBottom: spacing.xs },
  keypad: { gap: 12, marginTop: spacing.lg, width: '100%', maxWidth: 280 },
  keypadRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  keyBtn: {
    flex: 1,
    height: 58,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  keyEmpty: { flex: 1, height: 58 },
  keyText: { fontSize: 24, letterSpacing: trackingFor(24), fontWeight: '600' },
});
