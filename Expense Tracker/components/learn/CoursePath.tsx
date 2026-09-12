import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { Text } from '@/components/ui/Text';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { STAGES, SUBPART_SEQUENCE, coursesForStage } from '@/constants/courses';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useCourseStore } from '@/store/useCourseStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const RING_SIZE = 40;
const RING_STROKE = 3.5;

function ProgressRing({ progress, color, trackColor }: { progress: number; color: string; trackColor: string }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const c = RING_SIZE / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * Math.min(1, Math.max(0, progress));
  return (
    <Svg width={RING_SIZE} height={RING_SIZE}>
      <Circle cx={c} cy={c} r={r} stroke={trackColor} strokeWidth={RING_STROKE} fill="none" />
      {progress > 0 ? (
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={color}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
      ) : null}
    </Svg>
  );
}

// Only one stage is mounted at once. That keeps the 104-course path
// quick to scroll and avoids rendering a wall of locked cards on every visit.
export function CoursePath() {
  const { colors } = useTheme();
  const selectedLevel = useSettingsStore((state) => state.selectedLevel);
  const { courseProgress, isCourseUnlocked, isCourseComplete, getCurrentStage } = useCourseStore(
    useShallow((s) => ({
      courseProgress: s.courseProgress,
      isCourseUnlocked: s.isCourseUnlocked,
      isCourseComplete: s.isCourseComplete,
      getCurrentStage: s.getCurrentStage,
    }))
  );
  const recommendedStage = getCurrentStage();
  const [expandedStage, setExpandedStage] = useState<1 | 2 | 3 | 4 | null>(recommendedStage);

  useEffect(() => {
    setExpandedStage(recommendedStage);
  }, [recommendedStage, selectedLevel]);

  return (
    <View style={{ gap: spacing.xl }}>
      {STAGES.map((stage) => {
        const courses = coursesForStage(stage.id);
        const stageComplete = courses.every((c) => isCourseComplete(c.id));
        const completedCount = courses.filter((course) => isCourseComplete(course.id)).length;
        const expanded = expandedStage === stage.id;
        return (
          <View key={stage.id}>
            <Pressable
              feedbackCategory="selection"
              onPress={() => setExpandedStage((current) => current === stage.id ? null : stage.id)}
              style={[styles.stageHead, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stageLabel, { color: expanded ? colors.accent : colors.text3 }]}>
                  Stage {stage.id} · {stage.label}
                </Text>
                <Text style={[styles.stageCount, { color: colors.text3 }]}>
                  {completedCount}/{courses.length} courses complete
                </Text>
              </View>
              {stageComplete ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text3} />
            </Pressable>
            {expanded ? <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {courses.map((course) => {
                const unlocked = isCourseUnlocked(course.id);
                const complete = isCourseComplete(course.id);
                const done = courseProgress[course.id]?.subpartsDone.length ?? 0;
                const progress = done / SUBPART_SEQUENCE.length;

                return (
                  <Pressable
                    feedbackCategory="navigation"
                    key={course.id}
                    disabled={!unlocked}
                    onPress={() => router.push(`/learn/course/${course.id}`)}
                    style={[
                      styles.node,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      !unlocked && styles.nodeLocked,
                    ]}>
                    <View style={styles.ringWrap}>
                      <ProgressRing
                        progress={complete ? 1 : progress}
                        color={complete ? colors.success : colors.accent}
                        trackColor={colors.border}
                      />
                      <View style={styles.ringIcon}>
                        <Ionicons
                          name={unlocked ? course.icon : 'lock-closed'}
                          size={16}
                          color={complete ? colors.success : unlocked ? colors.accent : colors.text3}
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.nodeTitle, { color: unlocked ? colors.text : colors.text3 }]}>{course.title}</Text>
                      <Text style={[styles.nodeSummary, { color: colors.text3 }]} numberOfLines={1}>
                        {unlocked ? course.summary : 'Complete the previous course to unlock'}
                      </Text>
                    </View>
                    {unlocked ? (
                      <Text style={[styles.nodeCount, { color: complete ? colors.success : colors.text3 }]}>
                        {complete ? 'Done' : `${done}/${SUBPART_SEQUENCE.length}`}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stageLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  stageCount: { fontSize: 11.5, marginTop: 2, letterSpacing: trackingFor(11.5) },
  node: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  nodeLocked: { opacity: 0.6 },
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringIcon: { position: 'absolute' },
  nodeTitle: { fontSize: 14, fontWeight: '700', letterSpacing: trackingFor(14) },
  nodeSummary: { fontSize: 11.5, marginTop: 1, letterSpacing: trackingFor(11.5) },
  nodeCount: { fontSize: 11.5, fontWeight: '700', letterSpacing: trackingFor(11.5) },
});
