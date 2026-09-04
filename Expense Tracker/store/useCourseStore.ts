import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { COURSES, SUBPART_SEQUENCE, type SubpartType } from '@/constants/courses';
import { todayStr } from '@/utils/date';

type CourseProgress = { subpartsDone: SubpartType[]; completedAt: string | null };

type CourseState = {
  courseProgress: Record<string, CourseProgress>;
  completeSubpart: (courseId: string, subpart: SubpartType) => { courseCompleted: boolean };
  isSubpartDone: (courseId: string, subpart: SubpartType) => boolean;
  isCourseComplete: (courseId: string) => boolean;
  isCourseUnlocked: (courseId: string) => boolean;
  nextSubpartFor: (courseId: string) => SubpartType | null; // null once the course is complete
  getCurrentStage: () => 1 | 2 | 3;
};

export const useCourseStore = create<CourseState>()(
  persist(
    (set, get) => ({
      courseProgress: {},

      completeSubpart: (courseId, subpart) => {
        const state = get();
        const prior = state.courseProgress[courseId] ?? { subpartsDone: [], completedAt: null };
        if (prior.subpartsDone.includes(subpart)) return { courseCompleted: !!prior.completedAt };

        const subpartsDone = [...prior.subpartsDone, subpart];
        const courseCompleted = SUBPART_SEQUENCE.every((s) => subpartsDone.includes(s));
        const progress: CourseProgress = {
          subpartsDone,
          completedAt: courseCompleted ? todayStr() : prior.completedAt,
        };
        set({ courseProgress: { ...state.courseProgress, [courseId]: progress } });
        return { courseCompleted };
      },

      isSubpartDone: (courseId, subpart) => !!get().courseProgress[courseId]?.subpartsDone.includes(subpart),

      isCourseComplete: (courseId) => !!get().courseProgress[courseId]?.completedAt,

      isCourseUnlocked: (courseId) => {
        const course = COURSES.find((c) => c.id === courseId);
        if (!course) return false;
        if (course.order === 1) return true;
        const prevCourse = COURSES.find((c) => c.order === course.order - 1);
        return prevCourse ? get().isCourseComplete(prevCourse.id) : true;
      },

      nextSubpartFor: (courseId) => {
        const done = get().courseProgress[courseId]?.subpartsDone ?? [];
        return SUBPART_SEQUENCE.find((s) => !done.includes(s)) ?? null;
      },

      getCurrentStage: () => {
        const state = get();
        for (const course of COURSES) {
          if (!state.isCourseComplete(course.id)) return course.stage;
        }
        return 3;
      },
    }),
    {
      name: 'course-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
