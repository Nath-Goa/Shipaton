import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { courseOf } from '@/constants/courses';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useCourseStore } from '@/store/useCourseStore';

export default function LessonScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { colors } = useTheme();
  const completeSubpart = useCourseStore((s) => s.completeSubpart);
  const course = courseOf(courseId ?? '');

  if (!course) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown course" />
      </Screen>
    );
  }

  function handleContinue() {
    completeSubpart(course!.id, 'lesson');
    router.back();
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="label" color={colors.accent}>
          {course.title}
        </AppText>
        {course.lesson.paragraphs.map((p, i) => (
          <AppText key={i} variant="body" color={colors.text2} style={styles.paragraph}>
            {p}
          </AppText>
        ))}

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          {course.lesson.keyTerms.map((kt) => (
            <Card key={kt.term} style={styles.termCard}>
              <AppText variant="subtitle" color={colors.text}>
                {kt.term}
              </AppText>
              <AppText variant="caption" color={colors.text3} style={{ marginTop: 2 }}>
                {kt.def}
              </AppText>
            </Card>
          ))}
        </View>

        <View style={{ marginTop: spacing.xl }}>
          <Button label="Continue" fullWidth onPress={handleContinue} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  paragraph: { marginTop: spacing.xs },
  termCard: { gap: 2 },
});
