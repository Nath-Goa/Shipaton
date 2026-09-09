import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { COURSES, SUBPART_SEQUENCE, type SubpartType } from '@/constants/courses';
import { useSettingsStore, type LearnerLevel } from '@/store/useSettingsStore';
import { todayStr } from '@/utils/date';

type CourseProgress = { subpartsDone: SubpartType[]; completedAt: string | null };

const START_STAGE_BY_LEVEL: Record<LearnerLevel, 1 | 2 | 3 | 4> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
  professional: 4,
};

function selectedStartStage(): 1 | 2 | 3 | 4 {
  const level = useSettingsStore.getState().selectedLevel;
  return level ? START_STAGE_BY_LEVEL[level] : 1;
}

type CourseState = {
  courseProgress: Record<string, CourseProgress>;
  completeSubpart: (courseId: string, subpart: SubpartType) => { courseCompleted: boolean };
  isSubpartDone: (courseId: string, subpart: SubpartType) => boolean;
  isCourseComplete: (courseId: string) => boolean;
  isCourseUnlocked: (courseId: string) => boolean;
  nextSubpartFor: (courseId: string) => SubpartType | null; // null once the course is complete
  getCurrentStage: () => 1 | 2 | 3 | 4;
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
        const startStage = selectedStartStage();
        const startingCourse = COURSES.find((c) => c.stage === startStage);
        if (course.order <= (startingCourse?.order ?? 1)) return true;
        const prevCourse = COURSES.find((c) => c.order === course.order - 1);
        return prevCourse ? get().isCourseComplete(prevCourse.id) : true;
      },

      nextSubpartFor: (courseId) => {
        const done = get().courseProgress[courseId]?.subpartsDone ?? [];
        return SUBPART_SEQUENCE.find((s) => !done.includes(s)) ?? null;
      },

      getCurrentStage: () => {
        const state = get();
        const startStage = selectedStartStage();
        const startingOrder = COURSES.find((course) => course.stage === startStage)?.order ?? 1;
        for (const course of COURSES.filter((item) => item.order >= startingOrder)) {
          if (!state.isCourseComplete(course.id)) return course.stage;
        }
        return COURSES[COURSES.length - 1]?.stage ?? 4;
      },
    }),
    {
      name: 'course-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
