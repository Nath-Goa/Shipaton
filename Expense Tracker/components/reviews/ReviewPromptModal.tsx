import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as StoreReview from 'expo-store-review';

import { Button } from '@/components/ui/Button';
import { triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useReviewStore } from '@/store/useReviewStore';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const STARS = [1, 2, 3, 4, 5];
// Only ask the OS for a native store rating once the person has already
// told us they're happy — never surface it to someone giving 1-3 stars.
const NATIVE_PROMPT_MIN_RATING = 4;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function ReviewPromptModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const submitReview = useReviewStore((s) => s.submitReview);
  const dismissReview = useReviewStore((s) => s.dismissReview);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');

  const handleClose = useCallback(() => {
    setRating(0);
    setFeedback('');
    onClose();
  }, [onClose]);

  const handleStarPress = useCallback((value: number) => {
    triggerFeedback('selection');
    setRating(value);
  }, []);

  const handleNotNow = useCallback(() => {
    dismissReview();
    handleClose();
  }, [dismissReview, handleClose]);

  const handleSubmit = useCallback(async () => {
    if (rating === 0) return;
    submitReview(rating, feedback);
    if (rating >= NATIVE_PROMPT_MIN_RATING) {
      try {
        if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
      } catch {
        // Native prompt is a bonus on top of the saved rating above — never
        // let it block closing the dialog.
      }
    }
    handleClose();
  }, [rating, feedback, submitReview, handleClose]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleNotNow}>
      <AnimatedPressable entering={FadeIn.duration(180)} style={styles.backdrop} onPress={handleNotNow}>
        <AnimatedPressable
          entering={FadeInDown.springify().damping(18)}
          style={[styles.sheet, { backgroundColor: colors.surface }]}
          onPress={(e: any) => e.stopPropagation()}>
          <Text style={[styles.title, { color: colors.text }]}>Enjoying the app?</Text>
          <Text style={[styles.subtitle, { color: colors.text3 }]}>
            Let us know how it&apos;s going — it only takes a second.
          </Text>

          <View style={styles.starRow}>
            {STARS.map((value) => (
              <Pressable key={value} hitSlop={8} onPress={() => handleStarPress(value)}>
                <Ionicons
                  name={value <= rating ? 'star' : 'star-outline'}
                  size={34}
                  color={value <= rating ? colors.warning : colors.text3}
                />
              </Pressable>
            ))}
          </View>

          {rating > 0 ? (
            <Animated.View entering={FadeInDown.duration(220)}>
              <TextInput
                value={feedback}
                onChangeText={setFeedback}
                placeholder="What did you like? (optional)"
                placeholderTextColor={colors.text3}
                multiline
                numberOfLines={3}
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 },
                ]}
              />
            </Animated.View>
          ) : null}

          <View style={styles.actions}>
            <Button label="Submit" fullWidth onPress={handleSubmit} disabled={rating === 0} />
            <Button label="Not now" variant="ghost" fullWidth onPress={handleNotNow} />
          </View>
        </AnimatedPressable>
      </AnimatedPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: { padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 13, marginBottom: spacing.sm },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginVertical: spacing.md },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
