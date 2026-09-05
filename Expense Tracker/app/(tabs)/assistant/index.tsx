import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { ChatBubble } from '@/components/chat/ChatBubble';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { FlappyBirdLoader } from '@/components/games/FlappyBirdLoader';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { badgeInfo } from '@/constants/badges';
import { radius, spacing } from '@/constants/theme';
import { TIER_LABELS } from '@/constants/subscription';
import { tickerOf } from '@/constants/tickers';
import { useAiQuota } from '@/hooks/useAiQuota';
import { useHasApiKey } from '@/hooks/useHasApiKey';
import { useTabEntrance } from '@/hooks/useTabEntrance';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { hasSharedFallback, sendChatMessage } from '@/services/ai/client';
import { describeAiError } from '@/services/ai/errorMessage';
import { buildAnalystSystemPrompt } from '@/services/ai/prompts';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { ChatMessage, ThreadKey } from '@/types/chat';
import { timeAgo } from '@/utils/date';
import { uid } from '@/utils/id';

export default function AssistantScreen() {
  const { symbol: paramSymbol } = useLocalSearchParams<{ symbol?: string }>();
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const tutorPersona = useSettingsStore((s) => s.tutorPersona);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const keyBroken = useSettingsStore((s) => !!s.brokenKeyProviders[aiProvider]);
  const upgradeToTier = useUpgradeToTier();
  const { hasKey } = useHasApiKey();
  const { remaining, locked: quotaExhausted } = useAiQuota();
  const { threads, addMessage, clearThread } = useChatStore();
  const recordAnalystQuestion = useStreakStore((s) => s.recordAnalystQuestion);
  const showToast = useToastStore((s) => s.show);

  const [activeThread, setActiveThread] = useState<ThreadKey>('general');
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const threadRowEntrance = useTabEntrance(0);
  const messagesEntrance = useTabEntrance(80);

  useEffect(() => {
    if (paramSymbol) setActiveThread(paramSymbol.toUpperCase());
  }, [paramSymbol]);

  const threadKeys = useMemo(() => {
    const keys = new Set<ThreadKey>(['general', ...Object.keys(threads)]);
    if (paramSymbol) keys.add(paramSymbol.toUpperCase());
    return Array.from(keys);
  }, [threads, paramSymbol]);

  const messages = threads[activeThread] ?? [];

  async function handleSend(text: string) {
    const userMessage: ChatMessage = { id: uid(), role: 'user', text, createdAt: Date.now() };
    addMessage(activeThread, userMessage);
    setLoading(true);

    const context = activeThread !== 'general' ? { symbol: activeThread, name: tickerOf(activeThread)?.name ?? activeThread } : undefined;
    const systemPrompt = buildAnalystSystemPrompt(context, tutorPersona);
    const history = [...messages, userMessage].map((m) => ({ role: m.role, text: m.text }));

    const result = await sendChatMessage(systemPrompt, history);
    setLoading(false);

    if (result.ok) {
      addMessage(activeThread, { id: uid(), role: 'assistant', text: result.data, createdAt: Date.now() });
      const earned = recordAnalystQuestion();
      if (earned.length) showToast(`${badgeInfo(earned[0]).icon} Badge earned: ${badgeInfo(earned[0]).label}`);
    } else {
      addMessage(activeThread, {
        id: uid(),
        role: 'assistant',
        text: describeAiError(result.error),
        createdAt: Date.now(),
        isError: true,
      });
    }
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }

  return (
    <Screen>
      <TopBar
        title="Assistant"
        subtitle="Ask the analyst — educational, not financial advice"
        right={<IconButton name="time-outline" onPress={() => setHistoryOpen(true)} />}
      />

      {threadKeys.length > 1 ? (
        <Animated.View style={threadRowEntrance}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.threadRow}>
            {threadKeys.map((key) => (
              <Chip
                key={key}
                label={key === 'general' ? 'General' : key}
                active={activeThread === key}
                onPress={() => setActiveThread(key)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <Animated.View style={[styles.flex, messagesEntrance]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 ? (
            <>
              <EmptyState
                icon="🤖"
                title={activeThread === 'general' ? 'Ask anything about investing' : `Ask about ${activeThread}`}
                message="Explains terms in plain English, scoped to this simulated app — not real market data."
              />
              <UpgradeBanner title="Never run out of questions" body="Upgrade for a bigger daily AI allowance." />
            </>
          ) : (
            messages.map((m) => <ChatBubble key={m.id} message={m} />)
          )}
          {loading ? (
            <>
              <TypingIndicator />
              <FlappyBirdLoader />
            </>
          ) : null}
        </ScrollView>
        </Animated.View>

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {hasKey === false && !hasSharedFallback() ? (
            <View style={styles.gate}>
              <Text style={[styles.gateText, { color: colors.text3 }]}>Add your API key in Settings to start chatting.</Text>
              <Button label="Open Settings" variant="ghost" onPress={() => router.push('/settings')} />
            </View>
          ) : quotaExhausted ? (
            <View style={styles.gate}>
              <Text style={[styles.gateText, { color: colors.text3 }]}>
                {TIER_LABELS[tier]} hit its daily AI limit on the built-in key. Upgrade for more, or add your own API key for unlimited use.
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Add your API key" variant="ghost" onPress={() => router.push('/settings')} />
                <Button label="Upgrade" onPress={() => upgradeToTier('pro')} />
              </View>
            </View>
          ) : (
            <>
              {keyBroken ? (
                <Text style={[styles.sharedHint, { color: colors.warning }]}>
                  Your saved API key isn't working — using the built-in key for now.
                </Text>
              ) : hasKey === false ? (
                <Text style={[styles.sharedHint, { color: colors.text3 }]}>
                  Using a shared free key — add your own in Settings for faster, better responses.
                </Text>
              ) : null}
              {remaining !== null ? (
                <Text style={[styles.quota, { color: colors.text3 }]}>{remaining} AI action{remaining === 1 ? '' : 's'} left today</Text>
              ) : null}
              <ChatComposer onSend={handleSend} loading={loading} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <HistoryModal
        visible={historyOpen}
        threads={threads}
        activeThread={activeThread}
        onClose={() => setHistoryOpen(false)}
        onSelect={(key) => {
          setActiveThread(key);
          setHistoryOpen(false);
        }}
        onClear={clearThread}
      />
    </Screen>
  );
}

function HistoryModal({
  visible,
  threads,
  activeThread,
  onClose,
  onSelect,
  onClear,
}: {
  visible: boolean;
  threads: Record<ThreadKey, ChatMessage[]>;
  activeThread: ThreadKey;
  onClose: () => void;
  onSelect: (key: ThreadKey) => void;
  onClear: (key: ThreadKey) => void;
}) {
  const { colors } = useTheme();

  const rows = useMemo(() => {
    const keys = new Set<ThreadKey>(['general', ...Object.keys(threads)]);
    return Array.from(keys)
      .map((key) => {
        const msgs = threads[key] ?? [];
        const last = msgs[msgs.length - 1];
        return { key, last, lastAt: last?.createdAt ?? 0, count: msgs.length };
      })
      .sort((a, b) => b.lastAt - a.lastAt);
  }, [threads]);

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
            <Text style={[styles.modalTitle, { color: colors.text }]}>Chat history</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {rows.map((row) => (
                <Pressable
                  key={row.key}
                  onPress={() => onSelect(row.key)}
                  onLongPress={() => row.count > 0 && onClear(row.key)}
                  style={[
                    styles.historyRow,
                    { borderColor: row.key === activeThread ? colors.accent : colors.border },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyLabel, { color: colors.text }]}>
                      {row.key === 'general' ? 'General' : row.key}
                    </Text>
                    <Text style={[styles.historyPreview, { color: colors.text3 }]} numberOfLines={1}>
                      {row.last ? row.last.text : 'No messages yet'}
                    </Text>
                  </View>
                  {row.lastAt ? <Text style={[styles.historyTime, { color: colors.text3 }]}>{timeAgo(row.lastAt)}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
            <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  threadRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  messages: { padding: spacing.xl, paddingTop: spacing.sm, flexGrow: 1, justifyContent: 'flex-end' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: 6 },
  gate: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  gateText: { fontSize: 12.5, textAlign: 'center' },
  sharedHint: { fontSize: 11, textAlign: 'center', paddingHorizontal: spacing.sm, paddingBottom: 2 },
  quota: { fontSize: 11.5, textAlign: 'right', paddingHorizontal: spacing.sm },
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalSheet: { padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { fontSize: 19, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyLabel: { fontSize: 14, fontWeight: '700' },
  historyPreview: { fontSize: 12.5, marginTop: 2 },
  historyTime: { fontSize: 11 },
});
