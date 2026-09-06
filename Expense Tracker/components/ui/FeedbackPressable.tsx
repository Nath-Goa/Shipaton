import { useCallback } from 'react';
import { Pressable, type PressableProps } from 'react-native';

import { triggerFeedback, type SoundCategory } from '@/constants/animations';

type Props = PressableProps & {
  feedbackCategory?: SoundCategory;
  feedbackEnabled?: boolean;
};

/** A plain Pressable that adds the app's category-specific sound and haptic. */
export function FeedbackPressable({
  feedbackCategory = 'secondary',
  feedbackEnabled = true,
  disabled,
  onPressIn,
  ...props
}: Props) {
  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    (event) => {
      if (!disabled && feedbackEnabled) triggerFeedback(feedbackCategory);
      onPressIn?.(event);
    },
    [disabled, feedbackCategory, feedbackEnabled, onPressIn]
  );

  return <Pressable {...props} disabled={disabled} onPressIn={handlePressIn} />;
}
