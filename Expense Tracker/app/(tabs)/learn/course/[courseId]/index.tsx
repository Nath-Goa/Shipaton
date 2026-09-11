import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CourseCertificateModal } from '@/components/learn/CourseCertificateModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { STAGES, SUBPART_LABELS, SUBPART_SEQUENCE, courseOf, type SubpartType } from '@/constants/courses';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useCourseStore } from '@/store/useCourseStore';

export default function CourseHomeScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { colors } = useTheme();
  const { courseProgress, isCourseUnlocked, isCourseComplete } = useCourseStore();
  const [certVisible, setCertVisible] = useState(false);

  const course = courseOf(courseId ?? '');

  if (!course) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown course" />
      </Screen>
    );
  }

  const unlocked = isCourseUnlocked(course.id);
  const done = courseProgress[course.id]?.subpartsDone ?? [];
  const complete = isCourseComplete(course.id);
  const stageLabel = STAGES.find((s) => s.id === course.stage)?.label ?? '';

  function openSubpart(subpart: SubpartType) {
    switch (subpart) {
      case 'lesson':
        router.push(`/learn/course/${course!.id}/lesson`);
        break;
      case 'flashcards':
        router.push({ pathname: '/learn/flashcards', params: { topic: course!.topicId, fromCourse: course!.id } });
        break;
      case 'quiz':
        router.push({ pathname: '/learn/quiz', params: { topic: course!.topicId, fromCourse: course!.id } });
        break;
      case 'practice':
        router.push(`/learn/course/${course!.id}/practice`);
        break;
      case 'mastery':
        router.push({
          pathname: '/learn/quiz',
          params: { topic: course!.topicId, mode: 'mastery', fromCourse: course!.id },
        });
        break;
    }
  }

  if (!unlocked) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="🔒" title="Course locked" message="Complete the previous course in this stage to unlock it." />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: course.title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)} style={styles.head}>
          <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={course.icon} size={28} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{course.title}</Text>
          <Text style={[styles.summary, { color: colors.text2 }]}>{course.summary}</Text>
        </Animated.View>

        {complete ? (
          <Animated.View entering={FadeInDown.delay(40).springify().damping(16)}>
            <Pressable
              feedbackCategory="success"
              onPress={() => setCertVisible(true)}
              style={[styles.completeBanner, { backgroundColor: colors.successSoft, borderColor: colors.success }]}>
              <Ionicons name="ribbon" size={20} color={colors.success} />
              <Text style={[styles.completeText, { color: colors.success }]}>Course complete — view certificate</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {SUBPART_SEQUENCE.map((subpart, i) => {
            const subDone = done.includes(subpart);
            const subUnlocked = i === 0 || done.includes(SUBPART_SEQUENCE[i - 1]);
            const icon = subDone ? 'checkmark-circle' : subUnlocked ? 'ellipse-outline' : 'lock-closed';
            const color = subDone ? colors.success : subUnlocked ? colors.accent : colors.text3;
            return (
              <Animated.View key={subpart} entering={FadeInDown.delay(60 + i * 40).springify().damping(16)}>
                <Pressable
                  feedbackCategory="navigation"
                  disabled={!subUnlocked}
                  onPress={() => openSubpart(subpart)}
                  style={[
                    styles.row,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    !subUnlocked && { opacity: 0.5 },
                  ]}>
                  <Ionicons name={icon} size={22} color={color} />
                  <Text style={[styles.rowLabel, { color: subUnlocked ? colors.text : colors.text3 }]}>
                    {SUBPART_LABELS[subpart]}
                  </Text>
                  {subUnlocked && !subDone ? <Ionicons name="chevron-forward" size={18} color={colors.text3} /> : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <Button label="Back to path" variant="ghost" onPress={() => router.back()} />
      </ScrollView>

      <CourseCertificateModal
        visible={certVisible}
        onClose={() => setCertVisible(false)}
        courseTitle={course.title}
        stageLabel={`Stage ${course.stage} · ${stageLabel}`}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl },
  head: { alignItems: 'center', textAlign: 'center' },
  iconBadge: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', marginTop: spacing.md, textAlign: 'center', letterSpacing: trackingFor(20) },
  summary: { fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 18, letterSpacing: trackingFor(13) },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  completeText: { fontSize: 13.5, fontWeight: '700', flex: 1, letterSpacing: trackingFor(13.5) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowLabel: { fontSize: 14.5, fontWeight: '600', flex: 1, letterSpacing: trackingFor(14.5) },
});
