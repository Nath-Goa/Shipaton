import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  // Called with an owner's name for one of the two fixed owner logins below
  // (jumps straight to Max), or with no argument for the generic dev login
  // (cycles free -> pro -> max -> free).
  onSuccess: (ownerName?: string) => void;
};

// A hidden founder/developer gate — reached by tapping the Settings title
// nine times. Entirely local: no backend, no network call, just a string
// comparison, same threat model as the existing no-RevenueCat-key dev tier
// switcher on the upgrade screen. Deliberately fake/throwaway credentials,
// not real personal ones — this file gets committed to git, and a real
// reused password would sit in git history forever once pushed.
const DEV_USERNAME = 'aryanathan';
const DEV_PASSWORD = 'unlimited_stocks';

// Two fixed team-owner logins — always unlock Max directly rather than
// cycling, and greet the specific person by name.
const OWNER_LOGINS: { username: string; password: string; name: string }[] = [
  { username: 'owner_arya', password: 'paper-trader-owner-arya-26', name: 'Arya' },
  { username: 'owner_nathan', password: 'paper-trader-owner-nathan-26', name: 'Nathan' },
];

export function DevLoginModal({ visible, onClose, onSuccess }: Props) {
  const { colors } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const shakeTranslate = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setUsername('');
      setPassword('');
      setErrorMsg(null);
    }
  }, [visible]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeTranslate.value }],
  }));

  function handleSubmit() {
    const owner = OWNER_LOGINS.find((o) => o.username === username && o.password === password);
    if (owner) {
      triggerFeedback('success');
      onSuccess(owner.name);
      onClose();
      return;
    }
    if (username === DEV_USERNAME && password === DEV_PASSWORD) {
      triggerFeedback('success');
      onSuccess();
      onClose();
      return;
    }
    triggerFeedback('error');
    setErrorMsg('Incorrect username or password.');
    shakeTranslate.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withSpring(10, springs.snappy),
      withSpring(-6, springs.snappy),
      withSpring(0, springs.snappy)
    );
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.sheetWrap}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.surface }]} onPress={(e) => e.stopPropagation()}>
            <Animated.View style={shakeStyle}>
              <Text style={[styles.title, { color: colors.text }]}>Developer Access</Text>
              <Text style={[styles.subtitle, { color: colors.text2 }]}>
                Sign in to switch plans locally on this device.
              </Text>

              <View style={styles.fields}>
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Username"
                  placeholderTextColor={colors.text3}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.text3}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                />
              </View>

              {errorMsg ? <Text style={[styles.errorText, { color: colors.danger }]}>{errorMsg}</Text> : null}

              <View style={styles.actions}>
                <Button label="Sign in" fullWidth onPress={handleSubmit} disabled={!username || !password} />
                <Button label="Cancel" variant="ghost" fullWidth onPress={onClose} />
              </View>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheetWrap: { width: '100%' },
  sheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
  },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, textAlign: 'center', marginTop: 2, marginBottom: spacing.md },
  fields: { gap: spacing.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
  },
  errorText: { fontSize: 13, textAlign: 'center', fontWeight: '600', marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
});
