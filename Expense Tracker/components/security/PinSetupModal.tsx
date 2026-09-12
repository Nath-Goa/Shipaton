import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import {
  getBiometricCapabilities,
  saveStoredPin,
  type BiometricCapabilities,
} from '@/services/security/appLock';
import { useSettingsStore } from '@/store/useSettingsStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isChangingPin?: boolean;
};

type Step = 'enter' | 'confirm' | 'biometric';

export function PinSetupModal({ visible, onClose, onSuccess, isChangingPin = false }: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const setAppLockEnabled = useSettingsStore((s) => s.setAppLockEnabled);
  const setPinConfig = useSettingsStore((s) => s.setPinConfig);
  const setUseBiometrics = useSettingsStore((s) => s.setUseBiometrics);
  const setBiometricType = useSettingsStore((s) => s.setBiometricType);

  const [pinLength, setPinLength] = useState<4 | 6>(4);
  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [biometrics, setBiometrics] = useState<BiometricCapabilities | null>(null);

  const shakeTranslate = useSharedValue(0);

  // Check device biometrics when modal opens
  useEffect(() => {
    if (visible) {
      getBiometricCapabilities().then(setBiometrics);
      // Reset state
      setStep('enter');
      setFirstPin('');
      setConfirmPin('');
      setErrorMsg(null);
    }
  }, [visible]);

  const triggerShake = useCallback(() => {
    triggerFeedback('error');
    // A shake is exactly the oscillating motion §14 wants gated — the red
    // dots/error text already carry the "wrong" signal on their own.
    if (!reducedMotion) {
      shakeTranslate.value = withSequence(
        withTiming(-12, { duration: 60 }),
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

  const handleKeyPress = useCallback(
    (num: string) => {
      setErrorMsg(null);

      if (step === 'enter') {
        if (firstPin.length < pinLength) {
          const next = firstPin + num;
          setFirstPin(next);
          if (next.length === pinLength) {
            // Automatically advance to confirmation
            setTimeout(() => {
              setStep('confirm');
            }, 120);
          }
        }
      } else if (step === 'confirm') {
        if (confirmPin.length < pinLength) {
          const next = confirmPin + num;
          setConfirmPin(next);
          if (next.length === pinLength) {
            // Validate match
            if (next === firstPin) {
              triggerFeedback('success');
              if (biometrics && biometrics.isEnrolled) {
                setTimeout(() => {
                  setStep('biometric');
                }, 140);
              } else {
                // No biometrics available, complete setup directly
                saveStoredPin(next).then((saved) => {
                  if (saved) {
                    setPinConfig({ pinLength, hasConfiguredPin: true });
                    setUseBiometrics(false);
                    setBiometricType('none');
                    setAppLockEnabled(true);
                    onSuccess?.();
                    onClose();
                  }
                });
              }
            } else {
              triggerShake();
              setErrorMsg('PINs do not match. Please try again.');
              setTimeout(() => {
                setConfirmPin('');
              }, 400);
            }
          }
        }
      }
    },
    [step, firstPin, confirmPin, pinLength, biometrics, triggerShake, setPinConfig, setUseBiometrics, setBiometricType, setAppLockEnabled, onSuccess, onClose]
  );

  const handleDelete = useCallback(() => {
    setErrorMsg(null);
    if (step === 'enter') {
      setFirstPin((p) => p.slice(0, -1));
    } else if (step === 'confirm') {
      setConfirmPin((p) => p.slice(0, -1));
    }
  }, [step]);

  const handleFinishWithBiometrics = useCallback(
    async (enableBiometric: boolean) => {
      // No triggerFeedback call here — the two Buttons below already fire
      // their own category-matched press feedback on touch-down (primary
      // for "Use ... + PIN", secondary for the ghost "Use PIN Only"); an
      // unconditional 'primary' here duplicated the former and mismatched
      // the latter.
      const saved = await saveStoredPin(firstPin);
      if (saved) {
        setPinConfig({ pinLength, hasConfiguredPin: true });
        setUseBiometrics(enableBiometric);
        setBiometricType(enableBiometric ? biometrics?.biometricType ?? 'none' : 'none');
        setAppLockEnabled(true);
        onSuccess?.();
        onClose();
      }
    },
    [firstPin, pinLength, biometrics, setPinConfig, setUseBiometrics, setBiometricType, setAppLockEnabled, onSuccess, onClose]
  );

  const currentDigits = step === 'enter' ? firstPin : confirmPin;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.sheetWrap}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            {step === 'biometric' ? (
              <View style={styles.biometricStep}>
                <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons
                    name={biometrics?.biometricType === 'face' ? 'scan-outline' : 'finger-print-outline'}
                    size={38}
                    color={colors.accent}
                  />
                </View>
                <Text style={[styles.stepTitle, { color: colors.text }]}>Enable {biometrics?.label}?</Text>
                <Text style={[styles.stepSubtitle, { color: colors.text2 }]}>
                  Unlock instantly using {biometrics?.label}. Your {pinLength}-digit PIN is always available as a backup.
                </Text>

                <View style={styles.biometricActions}>
                  <Button
                    label={`Use ${biometrics?.label} + PIN`}
                    fullWidth
                    onPress={() => handleFinishWithBiometrics(true)}
                  />
                  <Button
                    label="Use PIN Only"
                    variant="ghost"
                    fullWidth
                    onPress={() => handleFinishWithBiometrics(false)}
                  />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <Text style={[styles.stepTitle, { color: colors.text }]}>
                    {step === 'enter'
                      ? isChangingPin
                        ? 'Set New PIN'
                        : 'Set App Lock PIN'
                      : 'Confirm Your PIN'}
                  </Text>
                  <Text style={[styles.stepSubtitle, { color: colors.text2 }]}>
                    {step === 'enter'
                      ? `Create a ${pinLength}-digit PIN. It is required to protect your financial sandbox.`
                      : `Re-enter your ${pinLength}-digit PIN to verify.`}
                  </Text>
                </View>

                {step === 'enter' && (
                  <View style={styles.lengthPicker}>
                    <SegmentedControl
                      options={[
                        { value: '4', label: '4 Digits' },
                        { value: '6', label: '6 Digits' },
                      ]}
                      value={String(pinLength)}
                      onChange={(val) => {
                        const len = Number(val) as 4 | 6;
                        setPinLength(len);
                        setFirstPin('');
                        setConfirmPin('');
                        setErrorMsg(null);
                      }}
                    />
                  </View>
                )}

                {/* PIN Dots Display */}
                <Animated.View style={[styles.dotsRow, shakeStyle]}>
                  {Array.from({ length: pinLength }).map((_, i) => {
                    const isFilled = i < currentDigits.length;
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

                {/* Keypad */}
                <View style={styles.keypad}>
                  {[
                    ['1', '2', '3'],
                    ['4', '5', '6'],
                    ['7', '8', '9'],
                    ['', '0', 'del'],
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
                              disabled={currentDigits.length === 0}
                              style={({ pressed }) => [
                                styles.keyBtn,
                                { opacity: pressed ? 0.6 : currentDigits.length === 0 ? 0.3 : 1 },
                              ]}>
                              <Ionicons name="backspace-outline" size={24} color={colors.text} />
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

                <View style={styles.footerRow}>
                  <Button label="Cancel" variant="ghost" onPress={onClose} />
                </View>
              </>
            )}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
  modalSheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
  },
  header: { alignItems: 'center', gap: 6 },
  stepTitle: { fontSize: 20, letterSpacing: trackingFor(20), fontWeight: '700', textAlign: 'center' },
  stepSubtitle: { fontSize: 13.5, letterSpacing: trackingFor(13.5), lineHeight: 18, textAlign: 'center', maxWidth: 300 },
  lengthPicker: { width: 180, alignSelf: 'center', marginVertical: spacing.xs },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginVertical: spacing.md,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  errorText: { fontSize: 13, letterSpacing: trackingFor(13), textAlign: 'center', fontWeight: '600' },
  keypad: { gap: 10, marginTop: spacing.sm, maxWidth: 300, alignSelf: 'center', width: '100%' },
  keypadRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  keyBtn: {
    flex: 1,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  keyEmpty: { flex: 1, height: 54 },
  keyText: { fontSize: 22, letterSpacing: trackingFor(22), fontWeight: '600' },
  footerRow: { alignItems: 'center', marginTop: spacing.xs },
  biometricStep: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.md },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  biometricActions: { width: '100%', gap: spacing.sm, marginTop: spacing.lg },
});
