import { COURSES } from '@/constants/courses';
import { useCourseStore } from '@/store/useCourseStore';
import { useStreakStore } from '@/store/useStreakStore';

export function courseBadgeId(courseId: string): string {
  return `course_${courseId.replace(/-/g, '_')}`;
}

export function stageBadgeId(stage: 1 | 2 | 3): string {
  return `stage_${stage}_complete`;
}

// Call once a course's 5th (mastery) subpart completes. Awards that
// course's badge, and — if every course in its stage is now also done —
// the stage badge too. Returns every badge id newly earned (may be empty).
export function awardCourseCompletionBadges(courseId: string): string[] {
  const course = COURSES.find((c) => c.id === courseId);
  if (!course) return [];

  const earned = [...useStreakStore.getState().awardBadge(courseBadgeId(courseId))];

  const stageCourses = COURSES.filter((c) => c.stage === course.stage);
  const stageComplete = stageCourses.every((c) => useCourseStore.getState().isCourseComplete(c.id));
  if (stageComplete) {
    earned.push(...useStreakStore.getState().awardBadge(stageBadgeId(course.stage)));
  }
  return earned;
}
