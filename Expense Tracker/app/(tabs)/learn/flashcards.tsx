import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { LoadingGame } from '@/components/games/LoadingGame';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { triggerFeedback } from '@/constants/animations';
import { bankFlashcardsFor } from '@/constants/flashcardBank';
import { QUIZ_TOPICS, quizTopicOf } from '@/constants/quizTopics';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError, aiErrorActions } from '@/services/ai/errorMessage';
import { generateFlashcards } from '@/services/ai/learn';
import { useCourseStore } from '@/store/useCourseStore';
import { useFlashcardStore } from '@/store/useFlashcardStore';
import type { Flashcard, FlashcardHistoryEntry, FlashcardSource } from '@/types/flashcard';
import { timeAgo } from '@/utils/date';
import { uid } from '@/utils/id';

type QueueItem = { card: Flashcard; source: FlashcardSource; bankIndex: number | null };

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function FlashcardsScreen() {
  const { topic, fromCourse } = useLocalSearchParams<{ topic?: string; fromCourse?: string }>();
  if (!topic) return <TopicPicker />;
  return <DeckViewer topic={topic} fromCourse={fromCourse} />;
}

function TopicPicker() {
  const { colors } = useTheme();

  const topicsByCategory = useMemo(() => {
    const groups: Record<string, typeof QUIZ_TOPICS> = {};
    for (const t of QUIZ_TOPICS) {
      groups[t.category] = groups[t.category] ? [...groups[t.category], t] : [t];
    }
    return groups;
  }, []);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <TopBar title="Flashcards" subtitle="Pick a topic to review" />
      <ScrollView contentContainerStyle={styles.content}>
        {Object.entries(topicsByCategory).map(([category, topics], gi) => (
          <Animated.View key={category} entering={FadeInDown.delay(Math.min(gi * 60, 240)).springify().damping(16)}>
            <Text style={[styles.categoryLabel, { color: colors.text3 }]}>{category}</Text>
            <Card style={{ marginTop: spacing.sm, gap: 0 }}>
              {topics.map((t, i) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    triggerFeedback('navigation');
                    router.push({ pathname: '/learn/flashcards', params: { topic: t.id } });
                  }}
                  style={[styles.topicRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.topicRowLabel, { color: colors.text }]}>{t.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.text3} />
                </Pressable>
              ))}
            </Card>
          </Animated.View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function DeckViewer({ topic, fromCourse }: { topic: string; fromCourse?: string }) {
  const { colors } = useTheme();
  const topicMeta = quizTopicOf(topic);
  const upgradeToTier = useUpgradeToTier();
  const { seenBankIndices, markBankSeen, history, addHistoryEntry, clearHistory } = useFlashcardStore();
  const completeSubpart = useCourseStore((s) => s.completeSubpart);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorActions, setErrorActions] = useState({ showAddKey: false, showUpgrade: false });
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadBankQueue = useCallback(() => {
    const bank = bankFlashcardsFor(topic);
    const seen = new Set(seenBankIndices[topic] ?? []);
    const unseen = bank.map((_, i) => i).filter((i) => !seen.has(i));
    const items: QueueItem[] = shuffled(unseen).map((i) => ({ card: bank[i], source: 'bank', bankIndex: i }));
    setQueue(items);
    setIndex(0);
    setFlipped(false);
    setReviewedCount(0);
    setLoading(false);
  }, [topic, seenBankIndices]);

  const loadAiBatch = useCallback(
    async (append: boolean) => {
      if (!topicMeta) return;
      setLoading(true);
      setError(null);
      const result = await generateFlashcards(topicMeta.label);
      setLoading(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        setErrorActions(aiErrorActions(result.error));
        return;
      }
      const items: QueueItem[] = result.data.cards.map((card) => ({ card, source: 'ai', bankIndex: null }));
      if (append) {
        // Keep whatever's left unshown in the current deck, then tack the
        // new batch on after it — reset to index 0 of that combined queue
        // since everything before the old index has already been reviewed
        // and dropped.
        setQueue((prev) => [...prev.slice(index), ...items]);
      } else {
        setQueue(items);
      }
      setIndex(0);
      setFlipped(false);
      if (!append) setReviewedCount(0);
    },
    [topicMeta, index]
  );

  useEffect(() => {
    loadBankQueue();
    // Only re-run when the topic changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  useEffect(() => {
    if (!loading && queue.length === 0 && index === 0 && reviewedCount === 0 && !error) {
      loadAiBatch(false);
    }
    // Fires once bank queue comes back empty — auto-falls back to AI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, loading]);

  function handleNext() {
    const current = queue[index];
    if (!current || !topic) return;
    triggerFeedback('selection');
    if (current.source === 'bank' && current.bankIndex !== null) markBankSeen(topic, current.bankIndex);
    addHistoryEntry(topic, {
      id: uid(),
      front: current.card.front,
      back: current.card.back,
      source: current.source,
      createdAt: Date.now(),
    });
    setReviewedCount((c) => c + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  const current = queue[index];
  const deckDone = !loading && !error && !current;
  const topicHistory = history[topic] ?? [];

  // A course's "flashcards" subpart is satisfied by actually finishing the
  // deck, not just opening it — completeSubpart is idempotent, so this is
  // safe to re-fire if the deck is revisited after already being done.
  useEffect(() => {
    if (deckDone && fromCourse) completeSubpart(fromCourse, 'flashcards');
  }, [deckDone, fromCourse, completeSubpart]);

  if (!topicMeta) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown topic" />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <TopBar title={topicMeta.label} right={<IconButton name="time-outline" onPress={() => setHistoryOpen(true)} />} />
      <ScrollView contentContainerStyle={styles.content}>
        {current ? (
          <View style={styles.topicRow2}>
            <Text style={[styles.topicLabel, { color: colors.text3 }]}>
              Card {index + 1} of {queue.length}
            </Text>
            <PillBadge label={current.source === 'bank' ? 'Built-in' : 'AI-generated'} />
          </View>
        ) : null}

        {!loading ? (
          <Pressable onPress={() => loadAiBatch(true)} hitSlop={6}>
            <Text style={[styles.aiLink, { color: colors.accent }]}>🤖 Add 5 more with AI</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text3, marginTop: spacing.md }}>Writing flashcards…</Text>
            <LoadingGame />
          </View>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title="Couldn't generate flashcards"
            message={error}
            actionLabel={errorActions.showAddKey ? 'Add your API key' : 'Open Settings'}
            onAction={() => router.push('/settings')}
            secondaryActionLabel={errorActions.showUpgrade ? 'Upgrade' : undefined}
            onSecondaryAction={errorActions.showUpgrade ? () => upgradeToTier('pro') : undefined}
          />
        ) : current ? (
          <>
            {/* Entrance animation on this plain, non-touchable Animated.View
                — never on the Pressable below. A Reanimated `entering=` view
                can drop the first tap or two while it's still settling, and
                this card remounts (via `key={index}`) on every new card, so
                keeping the flip-tap on the same animated node made the very
                first tap on each new card unreliable. */}
            <Animated.View key={index} entering={FadeIn.duration(220)}>
              <Pressable
                onPress={() => {
                  triggerFeedback('selection');
                  setFlipped((f) => !f);
                }}
                style={[styles.flashcard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.flashcardLabel, { color: colors.text3 }]}>{flipped ? 'Answer' : 'Term'}</Text>
                <Text style={[styles.flashcardText, { color: colors.text }]}>{flipped ? current.card.back : current.card.front}</Text>
                <Text style={[styles.flipHint, { color: colors.text3 }]}>Tap to {flipped ? 'flip back' : 'reveal answer'}</Text>
              </Pressable>
            </Animated.View>

            <Button label="Next card" fullWidth onPress={handleNext} />
          </>
        ) : deckDone ? (
          <Animated.View entering={FadeInDown.springify().damping(16)}>
            <EmptyState
              icon="🎉"
              title="Deck complete"
              message={`You reviewed ${reviewedCount} card${reviewedCount === 1 ? '' : 's'}.`}
              actionLabel="Generate more with AI"
              onAction={() => loadAiBatch(false)}
              secondaryActionLabel={fromCourse ? 'Back to course' : 'Back to topics'}
              onSecondaryAction={() => (fromCourse ? router.back() : router.push('/learn/flashcards'))}
            />
          </Animated.View>
        ) : null}
      </ScrollView>

      <FlashcardHistoryModal
        visible={historyOpen}
        entries={topicHistory}
        onClose={() => setHistoryOpen(false)}
        onClear={() => clearHistory(topic)}
      />
    </Screen>
  );
}

function FlashcardHistoryModal({
  visible,
  entries,
  onClose,
  onClear,
}: {
  visible: boolean;
  entries: FlashcardHistoryEntry[];
  onClose: () => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const rows = useMemo(() => [...entries].reverse(), [entries]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.modalBackdrop}>
        {/* Entrance animation on this plain, non-touchable Animated.View —
            never on a Pressable. A Reanimated `entering=` view can drop the
            first tap or two while it's still settling, so the dismiss-on-tap
            area is a separate absolute-fill Pressable instead. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onPress={(e: any) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Flashcard history</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {rows.length === 0 ? (
                <Text style={[styles.historyEmpty, { color: colors.text3 }]}>No cards reviewed yet for this topic.</Text>
              ) : (
                rows.map((entry) => (
                  <View key={entry.id} style={[styles.historyRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyLabel, { color: colors.text }]} numberOfLines={1}>
                        {entry.front}
                      </Text>
                      <Text style={[styles.historyPreview, { color: colors.text3 }]} numberOfLines={1}>
                        {entry.back}
                      </Text>
                      <Text style={[styles.historyMeta, { color: colors.text3 }]}>
                        {entry.source === 'bank' ? 'Built-in' : 'AI-generated'} · {timeAgo(entry.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {rows.length > 0 ? (
                <View style={{ flex: 1 }}>
                  <Button label="Clear" variant="ghost" fullWidth onPress={onClear} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  categoryLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  topicRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.md },
  topicRowLabel: { fontSize: 14, fontWeight: '600' },
  topicRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topicLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  aiLink: { fontSize: 12.5, fontWeight: '600' },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  flashcard: {
    minHeight: 200,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  flashcardLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  flashcardText: { fontSize: 19, fontWeight: '700', textAlign: 'center', lineHeight: 26 },
  flipHint: { fontSize: 12, marginTop: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalSheet: { padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { fontSize: 19, fontWeight: '700' },
  historyEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.xl },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyLabel: { fontSize: 13.5, fontWeight: '600' },
  historyPreview: { fontSize: 12, marginTop: 2 },
  historyMeta: { fontSize: 11, marginTop: 3 },
});
