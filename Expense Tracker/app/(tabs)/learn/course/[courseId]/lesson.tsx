import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { DonutChart } from '@/components/charts/DonutChart';
import { SpeakButton } from '@/components/learn/SpeakButton';
import { VideoCard } from '@/components/learn/VideoCard';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { courseOf, lessonPagesFor } from '@/constants/courses';
import { spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError } from '@/services/ai/errorMessage';
import { generateTopicStory } from '@/services/ai/learn';
import { useCourseStore } from '@/store/useCourseStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { TopicStory } from '@/types/narrative';

type Mode = 'standard' | 'eli5' | 'story' | 'visual';
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'eli5', label: 'ELI5' },
  { value: 'story', label: 'Story' },
  { value: 'visual', label: 'Visual' },
];

const DONUT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a855f7', '#f43f5e'];

export default function LessonScreen() {
  const { courseId, debugMode } = useLocalSearchParams<{ courseId: string; debugMode?: string }>();
  const { colors } = useTheme();
  const completeSubpart = useCourseStore((s) => s.completeSubpart);
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const upgradeToTier = useUpgradeToTier();
  const course = courseOf(courseId ?? '');
  const lessonPages = course ? lessonPagesFor(course) : [];
  const scrollRef = useRef<ScrollView>(null);
  const initialMode = __DEV__ && MODE_OPTIONS.some((option) => option.value === debugMode) ? debugMode as Mode : 'standard';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [lessonIndex, setLessonIndex] = useState(0);

  const [story, setStory] = useState<TopicStory | null>(null);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);

  useEffect(() => {
    if (course && mode === 'story' && !story && !storyLoading && !storyError) handleSelectMode('story');
  }, [course, mode]);

  if (!course) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown course" />
      </Screen>
    );
  }

  const currentLessonIndex = Math.min(lessonIndex, Math.max(lessonPages.length - 1, 0));
  const page = lessonPages[currentLessonIndex];
  const isLastLesson = currentLessonIndex === lessonPages.length - 1;

  function handleContinue() {
    if (!course) return;
    if (!isLastLesson) {
      setLessonIndex((index) => index + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }

    completeSubpart(course.id, 'lesson');
    router.replace({ pathname: '/learn/flashcards', params: { topic: course.topicId, fromCourse: course.id } });
  }

  function handleSelectMode(next: Mode) {
    setMode(next);
    if (next === 'story' && !story && !storyLoading) {
      setStoryLoading(true);
      setStoryError(null);
      generateTopicStory(course!.title, course!.summary).then((result) => {
        setStoryLoading(false);
        if (!result.ok) {
          setStoryError(describeAiError(result.error));
          return;
        }
        setStory(result.data);
      });
    }
  }

  const paragraph = mode === 'eli5' ? page.eli5 : page.standard;
  const storyParagraph = story?.paragraphs[currentLessonIndex] ?? story?.paragraphs.at(-1) ?? '';
  const speakText = mode === 'story'
    ? story ? `${currentLessonIndex === 0 ? `${story.title}. ` : ''}${storyParagraph}${isLastLesson ? ` ${story.takeaway}` : ''}` : ''
    : mode === 'visual' ? '' : `${page.title}. ${paragraph} ${page.keyTerm?.def ?? ''}`;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <AppText variant="label" color={colors.accent}>
            {course.title}
          </AppText>
          {mode !== 'visual' && speakText ? <SpeakButton text={speakText} /> : null}
        </View>
        <View style={styles.lessonProgress}>
          <View style={styles.lessonProgressLabels}>
            <Text style={[styles.lessonNumber, { color: colors.text3 }]}>Lesson {currentLessonIndex + 1} of {lessonPages.length}</Text>
            <Text style={[styles.lessonPercent, { color: colors.accent }]}>
              {Math.round(((currentLessonIndex + 1) / lessonPages.length) * 100)}%
            </Text>
          </View>
          <ProgressBar
            pct={((currentLessonIndex + 1) / lessonPages.length) * 100}
            color={colors.accent}
            track={colors.surface2}
          />
        </View>
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={handleSelectMode} />

        {mode === 'standard' || mode === 'eli5' ? (
          <>
            <AppText variant="subtitle" color={colors.text} style={styles.pageTitle}>
              {page.title}
            </AppText>
            <AppText variant="body" color={colors.text2} style={styles.paragraph}>
              {paragraph}
            </AppText>
            {page.keyTerm ? (
              <Card style={styles.termCard}>
                <AppText variant="subtitle" color={colors.text}>{page.keyTerm.term}</AppText>
                <AppText variant="caption" color={colors.text3} style={{ marginTop: 2 }}>{page.keyTerm.def}</AppText>
              </Card>
            ) : null}
          </>
        ) : mode === 'story' ? (
          storyLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={{ color: colors.text3, marginTop: spacing.sm }}>Writing a story…</Text>
            </View>
          ) : storyError ? (
            <Card>
              <Text style={{ color: colors.danger }}>{storyError}</Text>
              <Button label="Try again" variant="ghost" onPress={() => handleSelectMode('story')} />
            </Card>
          ) : story ? (
            <>
              {currentLessonIndex === 0 ? (
                <AppText variant="subtitle" color={colors.text} style={{ marginTop: spacing.xs }}>{story.title}</AppText>
              ) : null}
              <AppText variant="body" color={colors.text2} style={styles.paragraph}>{storyParagraph}</AppText>
              {isLastLesson ? (
                <Card style={[styles.takeawayCard, { borderColor: colors.accent }]}>
                  <Ionicons name="bulb-outline" size={16} color={colors.accent} />
                  <AppText variant="caption" color={colors.text2} style={{ flex: 1 }}>{story.takeaway}</AppText>
                </Card>
              ) : null}
            </>
          ) : null
        ) : (
          <>
            {currentLessonIndex === 0 ? (
              <>
                <AppText variant="subtitle" color={colors.text}>Related video</AppText>
                <VideoCard videoId={course.visual.videoId} title={course.visual.videoTitle} source={course.visual.videoSource} />
                <Text style={{ color: colors.text3, fontSize: 12, lineHeight: 17 }}>
                  Every course includes a direct learning video. Tap the card to watch it on YouTube.
                </Text>
              </>
            ) : currentLessonIndex === 1 ? (
              !features.visualLearning ? (
                <Card style={styles.locked}>
                  <View style={styles.cardHead}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Interactive concept chart</Text>
                    <Ionicons name="lock-closed" size={16} color={colors.text3} />
                  </View>
                  <Text style={{ color: colors.text3, fontSize: 12.5, lineHeight: 17 }}>
                    The related video is free. Pro/Max also unlocks the visual breakdown for every course.
                  </Text>
                  <Button label="Upgrade to Pro" variant="ghost" onPress={() => upgradeToTier('pro')} />
                </Card>
              ) : (
                <Card style={{ alignItems: 'center', gap: spacing.md }}>
                  <DonutChart
                    key={course.id}
                    segments={course.visual.segments.map((s, i) => ({ ...s, color: DONUT_COLORS[i % DONUT_COLORS.length] }))}
                    centerLabel={course.title}
                    centerValue=""
                    size={150}
                    strokeWidth={20}
                  />
                  <View style={{ width: '100%', gap: 6 }}>
                    {course.visual.segments.map((s, i) => (
                      <View key={s.id} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }]} />
                        <Text style={{ color: colors.text2, fontSize: 12.5, flex: 1 }} numberOfLines={1}>{s.label}</Text>
                        <Text style={{ color: colors.text3, fontSize: 12.5, fontWeight: '600' }}>{s.value}%</Text>
                      </View>
                    ))}
                  </View>
                </Card>
              )
            ) : (
              <Card style={[styles.takeawayCard, { borderColor: colors.accent }]}>
                <Ionicons name="bulb-outline" size={16} color={colors.accent} />
                <Text style={{ color: colors.text2, fontSize: 12.5, lineHeight: 18, flex: 1 }}>{course.visual.caption}</Text>
              </Card>
            )}
          </>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Button label={isLastLesson ? 'Continue to flashcards' : 'Next lesson'} fullWidth onPress={handleContinue} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lessonProgress: { gap: spacing.xs },
  lessonProgressLabels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lessonNumber: { fontSize: 11.5, fontWeight: '600' },
  lessonPercent: { fontSize: 11.5, fontWeight: '700' },
  pageTitle: { marginTop: spacing.xs },
  paragraph: { marginTop: spacing.xs },
  termCard: { gap: 2 },
  center: { alignItems: 'center', paddingVertical: spacing.xl },
  takeawayCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1 },
  locked: { gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
